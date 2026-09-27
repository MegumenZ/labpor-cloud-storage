import { Elysia, t } from "elysia";
import { db, files, users, userFavorites } from "../db";
import { eq, and, isNull, ilike, inArray, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authPlugin, requireAuth } from "../auth/middleware";
import { s3, BUCKET_NAME } from "./s3";
import { Upload } from "@aws-sdk/lib-storage";
import { DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { writeLog } from "../utils/logger";
import { getPresignedUrls, getAllDescendants, deletePhysicalFile, fixHttpsUrl } from "../utils/ceph";
import { invalidateStorageCache } from "../utils/shared-queries";
import { Readable, Transform } from "stream";
import { finalizeUploadReservation, insertFileWithinQuota, releaseUploadReservation, reserveUploadSpace } from "../utils/storage-quota";
import { assertUploadSizeMatches, MAX_UPLOAD_BYTES, parseUploadSize, StorageQuotaExceededError, UploadSizeMismatchError, UploadTooLargeError, InvalidUploadSizeError } from "../utils/storage-quota-policy";

const BANNED_EXTENSIONS = [
    "html", "htm", "js", "ts", "php", "phtml", "php3", "php4", "php5", "phps",
    "asp", "aspx", "jsp", "exe", "bat", "sh", "cmd", "vbs", "com", "scr"
];

function getReqHostAndProto(c: any) {
    const requestHost = c.request?.headers?.get("host") || undefined;
    const requestProto = c.request?.headers?.get("x-forwarded-proto") || (c.request?.url ? new URL(c.request.url).protocol.replace(":", "") : undefined);
    return { requestHost, requestProto };
}

async function cleanupUncommittedUpload(options: {
    storagePath: string;
    userId: string;
    reservationId: string | null;
    objectUploaded: boolean;
    metadataSaved: boolean;
}): Promise<void> {
    const { storagePath, userId, reservationId, objectUploaded, metadataSaved } = options;
    let safeToReleaseReservation = !objectUploaded || metadataSaved;

    if (objectUploaded && !metadataSaved) {
        try {
            await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: storagePath }));
            safeToReleaseReservation = true;
        } catch (cleanupError: any) {
            // Keep the reservation until expiry if the orphaned object could not be removed.
            try {
                await writeLog("ERROR", "CEPH", "Failed to clean up uncommitted object: " + storagePath, {
                    userId,
                    errorStack: cleanupError?.stack,
                });
            } catch {
                console.error("Failed to log uncommitted object cleanup error:", cleanupError);
            }
        }
    }

    if (reservationId && safeToReleaseReservation) {
        try {
            await releaseUploadReservation(reservationId);
        } catch (releaseError) {
            console.error("Failed to release storage quota reservation:", releaseError);
        }
    }
}

export const filesRoutes = new Elysia({ prefix: "/files" })
    .use(authPlugin)
    .get("/", async (c) => {
        const user = await requireAuth(c);
        const { query, request, jwtPlugin } = c;
        const parentId = query.parentId ? String(query.parentId) : (query.folderId ? String(query.folderId) : null);
        const search = query.search ? String(query.search) : null;
        const isTrash = query.trash === 'true';
        const isFavorite = query.favorite === 'true';
        const isRecent = query.recent === 'true';

        // Shared/collective storage: anyone can see all deleted/normal files
        const conditions = [eq(files.isDeleted, isTrash)];

        if (search) {
            const escapedSearch = search.replace(/[%_]/g, '\\$&');
            conditions.push(ilike(files.name, `%${escapedSearch}%`));
        } else if (!isFavorite && !isRecent) {
            if (parentId) {
                conditions.push(eq(files.parentId, parentId));
            } else if (!isTrash) {
                conditions.push(isNull(files.parentId));
            }
        }

        // Filter favorites page by checking if the user has favorited it
        if (isFavorite) {
            conditions.push(sql`${userFavorites.id} IS NOT NULL`);
        }

        const page = Math.max(1, parseInt(String(query.page || "1"), 10));
        const limit = query.all === 'true' ? 10000 : Math.min(100, Math.max(1, parseInt(String(query.limit || "50"), 10)));
        const offset = (page - 1) * limit;

        const uploader = alias(users, "uploader");
        const deleter = alias(users, "deleter");

        let queryBuilder = db.select({
            id: files.id,
            userId: files.userId,
            parentId: files.parentId,
            name: files.name,
            type: files.type,
            size: files.size,
            storagePath: files.storagePath,
            isFolder: files.isFolder,
            createdAt: files.createdAt,
            isDeleted: files.isDeleted,
            deletedAt: files.deletedAt,
            deletedBy: files.deletedBy,
            allowEdit: files.allowEdit,
            uploaderName: uploader.displayName,
            uploaderUsername: uploader.username,
            deleterName: deleter.displayName,
            deleterUsername: deleter.username,
            isFavorite: sql<boolean>`CASE WHEN ${userFavorites.id} IS NOT NULL THEN true ELSE false END`
        })
        .from(files)
        .leftJoin(uploader, eq(files.userId, uploader.id))
        .leftJoin(deleter, eq(files.deletedBy, deleter.id))
        .leftJoin(userFavorites, and(eq(files.id, userFavorites.fileId), eq(userFavorites.userId, user.id)))
        .where(and(...conditions))
        .orderBy(desc(files.isFolder), desc(files.createdAt))
        .limit(limit + 1)
        .offset(offset) as any;

        const { requestHost, requestProto } = getReqHostAndProto(c);
        const rawResult = await queryBuilder;
        
        const hasMore = query.all === 'true' ? false : rawResult.length > limit;
        const result = hasMore ? rawResult.slice(0, limit) : rawResult;

        const data = await Promise.all(result.map(async (f: any) => {
            const urls = await getPresignedUrls(f.storagePath, f.type, f.name, requestHost, requestProto);
            return { ...f, ...urls };
        }));

        return { data, hasMore, page, limit };
    })
    .patch("/:id/favorite", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const fileId = params.id;

        const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
        if (!file) {
            set.status = 404;
            return { error: "File not found" };
        }

        // Check if favorite exists
        const [existingFavorite] = await db.select()
            .from(userFavorites)
            .where(and(eq(userFavorites.fileId, fileId), eq(userFavorites.userId, user.id)))
            .limit(1);

        const { requestHost, requestProto } = getReqHostAndProto(c);
        const urls = await getPresignedUrls(file.storagePath, file.type, file.name, requestHost, requestProto);
        if (existingFavorite) {
            // Unfavorite
            await db.delete(userFavorites)
                .where(and(eq(userFavorites.fileId, fileId), eq(userFavorites.userId, user.id)));
            return { data: { ...file, ...urls, isFavorite: false } };
        } else {
            // Favorite
            await db.insert(userFavorites).values({
                userId: user.id,
                fileId: fileId
            });
            return { data: { ...file, ...urls, isFavorite: true } };
        }
    })
    .get("/preview/:id", async (c) => {
        const { params, query, jwtPlugin, set, request } = c;
        const { id } = params;
        const { token } = query as { token?: string };
        if (!token) {
            set.status = 401;
            return { message: "Unauthorized: Missing presigned token" };
        }
        
        const payload = await jwtPlugin.verify(token);
        if (!payload || (payload as any).fileId !== id) {
            set.status = 401;
            return { message: "Unauthorized: Invalid or expired presigned token" };
        }
        
        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }
        
        if (file.isDeleted) {
            try {
                const user = await requireAuth(c);
                if (file.userId !== user.id && file.deletedBy !== user.id) {
                    set.status = 403;
                    return { message: "Forbidden: Cannot preview deleted file" };
                }
            } catch {
                set.status = 403;
                return { message: "Forbidden: Cannot preview deleted file" };
            }
        }
        
        const rangeHeader = request.headers.get("range");
        const s3Params: { Bucket: string; Key: string; Range?: string } = {
            Bucket: BUCKET_NAME,
            Key: file.storagePath
        };
        if (rangeHeader) {
            s3Params.Range = rangeHeader;
        }

        try {
            const s3Response = await s3.send(new GetObjectCommand(s3Params));
            
            const responseHeaders: Record<string, string> = {
                "Content-Type": file.type,
                "Content-Security-Policy": "default-src 'none'; sandbox;",
                "X-Content-Type-Options": "nosniff"
            };
            if (s3Response.ContentLength) {
                responseHeaders["Content-Length"] = s3Response.ContentLength.toString();
            }
            if (s3Response.ContentRange) {
                responseHeaders["Content-Range"] = s3Response.ContentRange;
            }

            const status = s3Response.ContentRange ? 206 : 200;

            return new Response(s3Response.Body as any, {
                status,
                headers: responseHeaders
            });
        } catch (err: any) {
            await writeLog("ERROR", "CEPH", `Failed to stream file preview from S3: ${err.message}`, {
                errorStack: err.stack
            });
            set.status = 500;
            return { message: "Error reading file from storage" };
        }
    })
    .head("/:id/download", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const { id } = params;
        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }

        if (file.isDeleted) {
            if (file.userId !== user.id && file.deletedBy !== user.id) {
                set.status = 403;
                return { message: "Forbidden: Cannot download deleted file" };
            }
        }

        set.headers["Content-Type"] = file.type;
        set.headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`;
        set.headers["Content-Length"] = file.size.toString();
        return new Response(null, { status: 200, headers: set.headers as HeadersInit });
    })
    .get("/:id/download", async (c) => {
        const user = await requireAuth(c);
        const { params, set, request } = c;
        const { id } = params;
        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }

        if (file.isDeleted) {
            if (file.userId !== user.id && file.deletedBy !== user.id) {
                set.status = 403;
                return { message: "Forbidden: Cannot download deleted file" };
            }
        }
        
        const rangeHeader = request.headers.get("range");
        const s3Params: { Bucket: string; Key: string; Range?: string } = {
            Bucket: BUCKET_NAME,
            Key: file.storagePath
        };
        if (rangeHeader) {
            s3Params.Range = rangeHeader;
        }

        try {
            const s3Response = await s3.send(new GetObjectCommand(s3Params));
            
            const responseHeaders: Record<string, string> = {
                "Content-Type": file.type,
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`
            };
            if (s3Response.ContentLength) {
                responseHeaders["Content-Length"] = s3Response.ContentLength.toString();
            }
            if (s3Response.ContentRange) {
                responseHeaders["Content-Range"] = s3Response.ContentRange;
            }

            const status = s3Response.ContentRange ? 206 : 200;

            return new Response(s3Response.Body as unknown as BodyInit, {
                status,
                headers: responseHeaders
            });
        } catch (err: any) {
            await writeLog("ERROR", "CEPH", `Failed to stream file download from S3: ${err.message}`, {
                userId: user.id,
                errorStack: err.stack
            });
            set.status = 500;
            return { message: "Error reading file from storage" };
        }
    })
    .post(
        "/stream-upload",
        async (c) => {
            const user = await requireAuth(c);
            const { set, request } = c;

            const filename = request.headers.get("x-file-name") || "uploaded-file";
            const fileType = request.headers.get("content-type") || "application/octet-stream";
            const parentId = request.headers.get("x-parent-id") || null;
            let decodedFileName = filename;
            try {
                decodedFileName = decodeURIComponent(filename);
            } catch {
                decodedFileName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
            }

            const extension = decodedFileName.split(".").pop()?.toLowerCase();
            if (!extension || BANNED_EXTENSIONS.includes(extension)) {
                set.status = 400;
                return { message: "File type is not allowed for security reasons" };
            }

            if (decodedFileName.includes("..") || decodedFileName.includes("/") || decodedFileName.includes(String.fromCharCode(92))) {
                set.status = 400;
                return { message: "Invalid file name" };
            }

            const declaredSize = parseUploadSize(
                request.headers.get("x-file-size") ?? request.headers.get("content-length"),
            );

            if (!request.body) {
                set.status = 400;
                return { message: "Request body cannot be empty" };
            }

            const safeFileName = Date.now() + "-" + crypto.randomUUID() + "." + extension;
            const storagePath = user.id + "/" + safeFileName;
            let reservationId: string | null = null;
            let objectUploaded = false;
            let metadataSaved = false;
            let uploadValidationError: Error | null = null;
            let totalUploadedBytes = 0;

            try {
                const activeReservationId = await reserveUploadSpace(user.id, storagePath, declaredSize);
                reservationId = activeReservationId;

                const uploadStart = Date.now();
                const sizeGuard = new Transform({
                    transform(chunk: any, encoding: string, callback: (error?: Error | null, data?: any) => void) {
                        const chunkBytes = typeof chunk === "string"
                            ? Buffer.byteLength(chunk, encoding as BufferEncoding)
                            : (chunk as Uint8Array).byteLength;
                        totalUploadedBytes += chunkBytes;

                        if (totalUploadedBytes > declaredSize) {
                            uploadValidationError = new UploadSizeMismatchError(declaredSize, totalUploadedBytes);
                            callback(uploadValidationError);
                            return;
                        }

                        callback(null, chunk);
                    },
                    flush(callback: (error?: Error | null) => void) {
                        try {
                            assertUploadSizeMatches(declaredSize, totalUploadedBytes);
                            callback();
                        } catch (error) {
                            uploadValidationError = error as Error;
                            callback(uploadValidationError);
                        }
                    },
                });
                const nodeStream = Readable.fromWeb(request.body as any).pipe(sizeGuard);

                const upload = new Upload({
                    client: s3,
                    params: {
                        Bucket: BUCKET_NAME,
                        Key: storagePath,
                        Body: nodeStream,
                        ContentType: fileType,
                    },
                    queueSize: 4,
                    partSize: 50 * 1024 * 1024, // 50MB parts
                    leavePartsOnError: false,
                });

                await upload.done();
                objectUploaded = true;

                const uploadDuration = Date.now() - uploadStart;
                await writeLog("INFO", "CEPH", "Successfully zero-RAM streamed file to Ceph S3: " + storagePath, {
                    userId: user.id,
                    elapsedMs: uploadDuration,
                    metadata: {
                        bucket: BUCKET_NAME,
                        key: storagePath,
                        fileSize: totalUploadedBytes,
                        contentType: fileType
                    }
                });

                const newFile = await finalizeUploadReservation(activeReservationId, {
                    name: decodedFileName,
                    type: fileType,
                    size: totalUploadedBytes,
                    parentId: parentId || null,
                    userId: user.id,
                    isFolder: false,
                    storagePath,
                });
                reservationId = null;
                metadataSaved = true;

                invalidateStorageCache();

                const [dbUser] = await db.select({ displayName: users.displayName })
                    .from(users)
                    .where(eq(users.id, user.id))
                    .limit(1);

                const { requestHost, requestProto } = getReqHostAndProto(c);
                const urls = await getPresignedUrls(newFile.storagePath, newFile.type, newFile.name, requestHost, requestProto);
                return {
                    data: {
                        ...newFile,
                        ...urls,
                        uploaderUsername: user.username,
                        uploaderName: dbUser?.displayName || user.username
                    }
                };
            } catch (err: any) {
                await cleanupUncommittedUpload({
                    storagePath,
                    userId: user.id,
                    reservationId,
                    objectUploaded,
                    metadataSaved,
                });

                if (uploadValidationError) throw uploadValidationError;
                if (
                    err instanceof StorageQuotaExceededError ||
                    err instanceof UploadTooLargeError ||
                    err instanceof InvalidUploadSizeError ||
                    err instanceof UploadSizeMismatchError
                ) {
                    throw err;
                }

                await writeLog("ERROR", "CEPH", "Failed zero-RAM streaming upload to S3: " + err.message, {
                    userId: user.id,
                    errorStack: err.stack
                });
                set.status = 500;
                return { message: "Failed to save file to cloud storage" };
            }
        }
    )
    .post(
        "/presigned-upload",
        async (c) => {
            const user = await requireAuth(c);
            const { body, set } = c;
            const { name, type, size, parentId } = (body || {}) as { name: string; type: string; size: number; parentId?: string | null };

            if (!name) {
                set.status = 400;
                return { message: "File name is required" };
            }

            const extension = name.split(".").pop()?.toLowerCase();
            if (!extension || BANNED_EXTENSIONS.includes(extension)) {
                set.status = 400;
                return { message: "File type is not allowed for security reasons" };
            }

            if (name.includes("..") || name.includes("/") || name.includes(String.fromCharCode(92))) {
                set.status = 400;
                return { message: "Invalid file name" };
            }

            if (!Number.isSafeInteger(size) || size < 0) {
                set.status = 400;
                return { message: "A valid non-negative integer file size is required" };
            }
            if (size > MAX_UPLOAD_BYTES) {
                set.status = 413;
                return { message: "File size exceeds the maximum allowed upload size" };
            }

            const safeFileName = Date.now() + "-" + crypto.randomUUID() + "." + extension;
            const storagePath = user.id + "/" + safeFileName;

            const putCmd = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: storagePath,
                ContentType: type || "application/octet-stream",
                ContentLength: size,
            });

            const rawUploadUrl = await getSignedUrl(s3, putCmd, {
                expiresIn: 86400,
                signableHeaders: new Set(["content-length"]),
            });
            const uploadUrl = fixHttpsUrl(rawUploadUrl);

            const newFile = await insertFileWithinQuota({
                name,
                type: type || "application/octet-stream",
                size,
                parentId: parentId || null,
                userId: user.id,
                isFolder: false,
                storagePath,
            });

            invalidateStorageCache();

            const [dbUser] = await db.select({ displayName: users.displayName })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1);

            const { requestHost, requestProto } = getReqHostAndProto(c);
            const urls = await getPresignedUrls(newFile.storagePath, newFile.type, newFile.name, requestHost, requestProto);

            return {
                uploadUrl,
                file: {
                    ...newFile,
                    ...urls,
                    uploaderUsername: user.username,
                    uploaderName: dbUser?.displayName || user.username
                }
            };
        }
    )
    .post(
        "/upload",
        async (c) => {
            const user = await requireAuth(c);
            const { set, body } = c;

            const bodyData = body as any;
            const uploadedFile = bodyData?.file as File | null;
            const parentId = (bodyData?.parentId as string) || null;

            if (!uploadedFile) {
                set.status = 400;
                return { message: "No file provided" };
            }

            const extension = uploadedFile.name.split(".").pop()?.toLowerCase();
            if (!extension || BANNED_EXTENSIONS.includes(extension)) {
                set.status = 400;
                return { message: "File type is not allowed for security reasons" };
            }

            if (!uploadedFile.name || uploadedFile.name.includes("..") || uploadedFile.name.includes("/") || uploadedFile.name.includes(String.fromCharCode(92))) {
                set.status = 400;
                return { message: "Invalid file name" };
            }

            if (!Number.isSafeInteger(uploadedFile.size) || uploadedFile.size < 0) {
                set.status = 400;
                return { message: "A valid non-negative integer file size is required" };
            }
            if (uploadedFile.size > MAX_UPLOAD_BYTES) {
                set.status = 413;
                return { message: "File size exceeds the maximum allowed upload size" };
            }

            const safeFileName = Date.now() + "-" + crypto.randomUUID() + "." + extension;
            const storagePath = user.id + "/" + safeFileName;
            let reservationId: string | null = null;
            let objectUploaded = false;
            let metadataSaved = false;

            try {
                const activeReservationId = await reserveUploadSpace(user.id, storagePath, uploadedFile.size);
                reservationId = activeReservationId;

                const uploadStart = Date.now();
                const webStream = uploadedFile.stream();
                const nodeStream = Readable.fromWeb(webStream as any);

                const upload = new Upload({
                    client: s3,
                    params: {
                        Bucket: BUCKET_NAME,
                        Key: storagePath,
                        Body: nodeStream,
                        ContentType: uploadedFile.type || "application/octet-stream",
                    },
                    queueSize: 4,
                    partSize: 50 * 1024 * 1024, // 50MB parts & 4 concurrency
                    leavePartsOnError: false,
                });

                await upload.done();
                objectUploaded = true;

                const uploadDuration = Date.now() - uploadStart;
                await writeLog("INFO", "CEPH", "Successfully uploaded file to Ceph S3: " + storagePath, {
                    userId: user.id,
                    elapsedMs: uploadDuration,
                    metadata: {
                        bucket: BUCKET_NAME,
                        key: storagePath,
                        fileSize: uploadedFile.size,
                        contentType: uploadedFile.type
                    }
                });

                const newFile = await finalizeUploadReservation(activeReservationId, {
                    name: uploadedFile.name,
                    type: uploadedFile.type || "application/octet-stream",
                    size: uploadedFile.size,
                    parentId: parentId || null,
                    userId: user.id,
                    isFolder: false,
                    storagePath,
                });
                reservationId = null;
                metadataSaved = true;

                invalidateStorageCache();

                const [dbUser] = await db.select({ displayName: users.displayName })
                    .from(users)
                    .where(eq(users.id, user.id))
                    .limit(1);

                const { requestHost, requestProto } = getReqHostAndProto(c);
                const urls = await getPresignedUrls(newFile.storagePath, newFile.type, newFile.name, requestHost, requestProto);
                return {
                    data: {
                        ...newFile,
                        ...urls,
                        uploaderUsername: user.username,
                        uploaderName: dbUser?.displayName || user.username
                    }
                };
            } catch (err: any) {
                await cleanupUncommittedUpload({
                    storagePath,
                    userId: user.id,
                    reservationId,
                    objectUploaded,
                    metadataSaved,
                });

                if (
                    err instanceof StorageQuotaExceededError ||
                    err instanceof UploadTooLargeError ||
                    err instanceof InvalidUploadSizeError ||
                    err instanceof UploadSizeMismatchError
                ) {
                    throw err;
                }

                await writeLog("ERROR", "CEPH", "Failed to upload file to Ceph S3 " + storagePath + ": " + err.message, {
                    userId: user.id,
                    errorStack: err.stack
                });
                set.status = 500;
                return { message: "Failed to save file to cloud storage" };
            }
        }
    )
    .post(
        "/folder",
        async (c) => {
            const user = await requireAuth(c);
            const { body, set } = c;

            const trimmedName = body.name.trim();
            if (!trimmedName || trimmedName.includes("..") || trimmedName.includes("/") || trimmedName.includes("\\")) {
                set.status = 400;
                return { message: "Invalid folder name" };
            }

            const [newFolder] = await db.insert(files).values({
                name: trimmedName,
                type: "folder",
                size: 0,
                parentId: body.parentId || null,
                userId: user.id,
                isFolder: true,
            }).returning();

            const [dbUser] = await db.select({ displayName: users.displayName })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1);

            return {
                data: {
                    ...newFolder,
                    uploaderUsername: user.username,
                    uploaderName: dbUser?.displayName || user.username
                }
            };
        },
        {
            body: t.Object({
                name: t.String(),
                parentId: t.Optional(t.Union([t.String(), t.Null()])),
            }),
        }
    )
    .delete("/:id", async (c) => {
        const user = await requireAuth(c);
        const { params, query, set } = c;
        const { id } = params;
        const permanent = query.permanent === 'true';

        let errStatus: number | null = null;
        let errMsg = "";
        const filesToDeleteFromS3: string[] = [];

        try {
            await db.transaction(async (tx) => {
                const [file] = await tx.select().from(files).where(eq(files.id, id));
                if (!file) {
                    errStatus = 404;
                    errMsg = "File not found";
                    tx.rollback();
                    return;
                }

                // Permission check: only owner can edit/delete if allowEdit is false
                if (file.userId !== user.id && !file.allowEdit) {
                    errStatus = 403;
                    errMsg = "Forbidden: File is locked by owner";
                    tx.rollback();
                    return;
                }

                if (permanent) {
                    if (file.isFolder) {
                        const descendants = await getAllDescendants(id);

                        for (const d of descendants) {
                            if (!d.isFolder && d.storagePath) {
                                filesToDeleteFromS3.push(d.storagePath);
                            }
                        }
                        const idsToDelete = [id, ...descendants.map(d => d.id)];
                        // Set parentId to null first to prevent foreign key constraint violations
                        await tx.update(files)
                            .set({ parentId: null })
                            .where(inArray(files.id, idsToDelete));
                        await tx.delete(files).where(inArray(files.id, idsToDelete));
                    } else {
                        if (file.storagePath) {
                            filesToDeleteFromS3.push(file.storagePath);
                        }
                        await tx.delete(files).where(eq(files.id, id));
                    }
                } else {
                    // Soft delete: track who deleted it in deletedBy
                    const now = new Date();
                    await tx.update(files)
                        .set({ isDeleted: true, deletedAt: now, deletedBy: user.id })
                        .where(eq(files.id, id));

                    if (file.isFolder) {
                        const descendants = await getAllDescendants(id);
                        if (descendants.length > 0) {
                            const descendantIds = descendants.map(d => d.id);
                            await tx.update(files)
                                .set({ isDeleted: true, deletedAt: now, deletedBy: user.id })
                                .where(inArray(files.id, descendantIds));
                        }
                    }
                }
            });
        } catch (error: any) {
            if (!errStatus) {
                set.status = 500;
                return { message: `Database error: ${error.message}` };
            }
        }

        if (errStatus) {
            set.status = errStatus;
            return { message: errMsg };
        }

        // physical delete only after db transaction commits successfully!
        for (const path of filesToDeleteFromS3) {
            await deletePhysicalFile(path, user.id);
        }

        invalidateStorageCache();

        return { message: "File deleted" };
    })
    .post("/:id/restore", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const { id } = params;

        let errStatus: number | null = null;
        let errMsg = "";

        try {
            await db.transaction(async (tx) => {
                const [file] = await tx.select().from(files).where(eq(files.id, id));
                if (!file) {
                    errStatus = 404;
                    errMsg = "File not found";
                    tx.rollback();
                    return;
                }

                // Restore permission check
                if (file.userId !== user.id && !file.allowEdit) {
                    errStatus = 403;
                    errMsg = "Forbidden: File is locked by owner";
                    tx.rollback();
                    return;
                }

                await tx.update(files)
                    .set({ isDeleted: false, deletedAt: null, deletedBy: null })
                    .where(eq(files.id, id));

                if (file.isFolder) {
                    const descendants = await getAllDescendants(id);
                    if (descendants.length > 0) {
                        const descendantIds = descendants.map(d => d.id);
                        await tx.update(files)
                            .set({ isDeleted: false, deletedAt: null, deletedBy: null })
                            .where(inArray(files.id, descendantIds));
                    }
                }
            });
        } catch (error: any) {
            if (!errStatus) {
                set.status = 500;
                return { message: `Database error: ${error.message}` };
            }
        }

        if (errStatus) {
            set.status = errStatus;
            return { message: errMsg };
        }

        invalidateStorageCache();

        return { message: "File restored" };
    })
    .put("/:id/rename", async (c) => {
        const user = await requireAuth(c);
        const { params, body, set } = c;
        const { id } = params;
        const { newName } = body as { newName: string };

        const trimmedName = newName.trim();
        if (!trimmedName || trimmedName.includes("..") || trimmedName.includes("/") || trimmedName.includes("\\")) {
            set.status = 400;
            return { message: "Invalid file or folder name" };
        }

        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        if (file.userId !== user.id && !file.allowEdit) {
            set.status = 403;
            return { message: "Forbidden: File is locked by owner" };
        }

        await db.update(files)
            .set({ name: trimmedName })
            .where(eq(files.id, id));

        return { message: "File renamed" };
    }, {
        body: t.Object({
            newName: t.String(),
        }),
    })
    .put("/:id/move", async (c) => {
        const user = await requireAuth(c);
        const { params, body, set } = c;
        const { id } = params;
        const { targetFolderId } = body as { targetFolderId: string | null };

        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        if (file.userId !== user.id && !file.allowEdit) {
            set.status = 403;
            return { message: "Forbidden: File is locked by owner" };
        }

        if (targetFolderId) {
            const [targetFolder] = await db.select()
                .from(files)
                .where(and(eq(files.id, targetFolderId), eq(files.isFolder, true)));
            if (!targetFolder) {
                set.status = 400;
                return { message: "Target folder not found" };
            }

            if (file.isFolder) {
                if (id === targetFolderId) {
                    set.status = 400;
                    return { message: "Cannot move a folder inside itself" };
                }
                const descendants = await getAllDescendants(id);
                const descendantIds = descendants.map(d => d.id);
                if (descendantIds.includes(targetFolderId)) {
                    set.status = 400;
                    return { message: "Cannot move a folder inside one of its subfolders" };
                }
            }
        }

        await db.update(files)
            .set({ parentId: targetFolderId })
            .where(eq(files.id, id));

        return { message: "File moved successfully" };
    })
    .delete("/trash", async (c) => {
        const user = await requireAuth(c);
        const { set } = c;

        const filesToDeleteFromS3: string[] = [];

        try {
            await db.transaction(async (tx) => {
                const trashItems = await tx.select()
                    .from(files)
                    .where(and(eq(files.isDeleted, true), eq(files.deletedBy, user.id)));

                for (const item of trashItems) {
                    if (!item.isFolder && item.storagePath) {
                        filesToDeleteFromS3.push(item.storagePath);
                    }
                }

                if (trashItems.length > 0) {
                    const trashIds = trashItems.map(item => item.id);
                    // Set parentId to null first to prevent foreign key constraint violations
                    await tx.update(files)
                        .set({ parentId: null })
                        .where(inArray(files.id, trashIds));
                    await tx.delete(files).where(inArray(files.id, trashIds));
                }
            });
        } catch (error: any) {
            set.status = 500;
            return { message: `Database error: ${error.message}` };
        }

        // Physical deletion occurs after successful database commit
        for (const path of filesToDeleteFromS3) {
            await deletePhysicalFile(path);
        }

        return { message: "Trash emptied" };
    })
    .patch("/:id/toggle-lock", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const { id } = params;

        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        // Only the owner can lock/unlock the file/folder
        if (file.userId !== user.id) {
            set.status = 403;
            return { message: "Forbidden: Only the owner can toggle file lock" };
        }

        const updated = await db.update(files)
            .set({ allowEdit: !file.allowEdit })
            .where(eq(files.id, id))
            .returning();

        const { requestHost, requestProto } = getReqHostAndProto(c);
        const urls = await getPresignedUrls(updated[0].storagePath, updated[0].type, updated[0].name, requestHost, requestProto);
        return { data: { ...updated[0], ...urls } };
    });
