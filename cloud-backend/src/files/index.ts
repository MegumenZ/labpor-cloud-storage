import { Elysia, t } from "elysia";
import { db, files, users, userFavorites } from "../db";
import { eq, and, isNull, ilike, inArray, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authPlugin, requireAuth } from "../auth/middleware";
import { s3, BUCKET_NAME } from "./s3";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeLog } from "../utils/logger";
import { getPresignedUrls, getAllDescendants, deletePhysicalFile } from "../utils/ceph";

const BANNED_EXTENSIONS = [
    "html", "htm", "js", "ts", "php", "phtml", "php3", "php4", "php5", "phps",
    "asp", "aspx", "jsp", "exe", "bat", "sh", "cmd", "vbs", "com", "scr"
];

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
            conditions.push(ilike(files.name, `%${search}%`));
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
        .where(and(...conditions));

        if (isRecent) {
            queryBuilder = queryBuilder.orderBy(desc(files.createdAt)).limit(20) as any;
        }

        const result = await queryBuilder;
        const data = await Promise.all(result.map(async (f) => {
            const urls = await getPresignedUrls(f.storagePath, f.type, f.name);
            return { ...f, ...urls };
        }));

        return { data };
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

        const urls = await getPresignedUrls(file.storagePath, file.type, file.name);
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
        if (!payload || payload.fileId !== id) {
            set.status = 401;
            return { message: "Unauthorized: Invalid or expired presigned token" };
        }
        
        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }
        
        const rangeHeader = request.headers.get("range");
        const s3Params: any = {
            Bucket: BUCKET_NAME,
            Key: file.storagePath
        };
        if (rangeHeader) {
            s3Params.Range = rangeHeader;
        }

        try {
            const s3Response = await s3.send(new GetObjectCommand(s3Params));
            
            const responseHeaders: any = {
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
    .get("/:id/download", async (c) => {
        const user = await requireAuth(c);
        const { params, set, request } = c;
        const { id } = params;
        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }
        
        const rangeHeader = request.headers.get("range");
        const s3Params: any = {
            Bucket: BUCKET_NAME,
            Key: file.storagePath
        };
        if (rangeHeader) {
            s3Params.Range = rangeHeader;
        }

        try {
            const s3Response = await s3.send(new GetObjectCommand(s3Params));
            
            const responseHeaders: any = {
                "Content-Type": file.type,
                "Content-Disposition": `attachment; filename="${file.name}"`
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
            await writeLog("ERROR", "CEPH", `Failed to stream file download from S3: ${err.message}`, {
                userId: user.id,
                errorStack: err.stack
            });
            set.status = 500;
            return { message: "Error reading file from storage" };
        }
    })
    .post(
        "/upload-local",
        async (c) => {
            const user = await requireAuth(c);
            const { body, set } = c;
            const uploadedFile = body.file as File;

            // 1️⃣ VALIDASI EKSTENSI FILE BERBAHAYA (Stored XSS & RCE)
            const extension = uploadedFile.name.split(".").pop()?.toLowerCase();
            if (!extension || BANNED_EXTENSIONS.includes(extension)) {
                set.status = 400;
                return { message: "File type is not allowed for security reasons" };
            }

            // 2️⃣ VALIDASI UKURAN (Diatur tinggi karena akan terhubung ke Ceph, misal 5GB)
            const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
            if (uploadedFile.size > MAX_SIZE) {
                set.status = 400;
                return { message: "File size exceeds 5GB" };
            }

            // 3️⃣ VALIDASI NAMA FILE (MINIMAL)
            if (!uploadedFile.name || uploadedFile.name.includes("..")) {
                set.status = 400;
                return { message: "Invalid file name" };
            }

            // 4️⃣ AMANKAN PATH (PER USER)
            const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const storagePath = `${user.id}/${safeFileName}`;

            // 5️⃣ SIMPAN FILE KE CEPH S3
            try {
                const uploadStart = Date.now();
                const arrayBuffer = await uploadedFile.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                await s3.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: storagePath,
                    Body: buffer,
                    ContentType: uploadedFile.type,
                }));
                
                const uploadDuration = Date.now() - uploadStart;
                await writeLog("INFO", "CEPH", `Successfully uploaded file to Ceph S3: ${storagePath}`, {
                    userId: user.id,
                    elapsedMs: uploadDuration,
                    metadata: {
                        bucket: BUCKET_NAME,
                        key: storagePath,
                        fileSize: uploadedFile.size,
                        contentType: uploadedFile.type
                    }
                });
            } catch (err: any) {
                await writeLog("ERROR", "CEPH", `Failed to upload file to Ceph S3 ${storagePath}: ${err.message}`, {
                    userId: user.id,
                    errorStack: err.stack
                });
                set.status = 500;
                return { message: "Failed to save file to cloud storage" };
            }

            // 6️⃣ SIMPAN KE DATABASE
            const [newFile] = await db.insert(files).values({
                name: uploadedFile.name,
                type: uploadedFile.type,
                size: uploadedFile.size,
                parentId: body.parentId || null,
                userId: user.id,
                isFolder: false,
                storagePath,
            }).returning();

            const [dbUser] = await db.select({ displayName: users.displayName })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1);

            const urls = await getPresignedUrls(newFile.storagePath, newFile.type, newFile.name);
            return {
                data: {
                    ...newFile,
                    ...urls,
                    uploaderUsername: user.username,
                    uploaderName: dbUser?.displayName || user.username
                }
            };
        },
        {
            body: t.Object({
                file: t.File(),
                parentId: t.Optional(t.String()),
            }),
        }
    )
    .post(
        "/folder",
        async (c) => {
            const user = await requireAuth(c);
            const { body, set } = c;

            const [newFolder] = await db.insert(files).values({
                name: body.name,
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

        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        // Permission check: only owner can edit/delete if allowEdit is false
        if (file.userId !== user.id && !file.allowEdit) {
            set.status = 403;
            return { message: "Forbidden: File is locked by owner" };
        }

        if (permanent) {
            if (file.isFolder) {
                const descendants = await getAllDescendants(id);
                for (const d of descendants) {
                    if (!d.isFolder && d.storagePath) {
                        await deletePhysicalFile(d.storagePath, user.id);
                    }
                }
                const idsToDelete = [id, ...descendants.map(d => d.id)];
                await db.delete(files).where(inArray(files.id, idsToDelete));
            } else {
                await deletePhysicalFile(file.storagePath, user.id);
                await db.delete(files).where(eq(files.id, id));
            }
        } else {
            // Soft delete: track who deleted it in deletedBy
            await db.update(files)
                .set({ isDeleted: true, deletedAt: new Date(), deletedBy: user.id })
                .where(eq(files.id, id));

            if (file.isFolder) {
                const descendants = await getAllDescendants(id);
                if (descendants.length > 0) {
                    const descendantIds = descendants.map(d => d.id);
                    await db.update(files)
                        .set({ isDeleted: true, deletedAt: new Date(), deletedBy: user.id })
                        .where(inArray(files.id, descendantIds));
                }
            }
        }

        return { message: "File deleted" };
    })
    .post("/:id/restore", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const { id } = params;

        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        // Restore permission check
        if (file.userId !== user.id && !file.allowEdit) {
            set.status = 403;
            return { message: "Forbidden: File is locked by owner" };
        }

        await db.update(files)
            .set({ isDeleted: false, deletedAt: null, deletedBy: null })
            .where(eq(files.id, id));

        if (file.isFolder) {
            const descendants = await getAllDescendants(id);
            if (descendants.length > 0) {
                const descendantIds = descendants.map(d => d.id);
                await db.update(files)
                    .set({ isDeleted: false, deletedAt: null, deletedBy: null })
                    .where(inArray(files.id, descendantIds));
            }
        }

        return { message: "File restored" };
    })
    .put("/:id/rename", async (c) => {
        const user = await requireAuth(c);
        const { params, body, set } = c;
        const { id } = params;
        const { newName } = body as { newName: string };

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
            .set({ name: newName })
            .where(eq(files.id, id));

        return { message: "File renamed" };
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

        // Empty the collective trash!
        const trashItems = await db.select()
            .from(files)
            .where(eq(files.isDeleted, true));

        for (const item of trashItems) {
            if (!item.isFolder && item.storagePath) {
                await deletePhysicalFile(item.storagePath);
            }
        }

        if (trashItems.length > 0) {
            const trashIds = trashItems.map(item => item.id);
            await db.delete(files).where(inArray(files.id, trashIds));
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

        const urls = await getPresignedUrls(updated[0].storagePath, updated[0].type, updated[0].name);
        return { data: { ...updated[0], ...urls } };
    });
