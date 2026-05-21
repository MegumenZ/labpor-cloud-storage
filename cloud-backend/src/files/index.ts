import { mkdir, unlink } from "fs/promises";
import { Elysia, t } from "elysia";
import { db, files, users } from "../db";
import { eq, and, isNull, ilike, inArray, desc } from "drizzle-orm";
import { authPlugin, requireAuth } from "../auth/middleware";

const BANNED_EXTENSIONS = [
    "html", "htm", "js", "ts", "php", "phtml", "php3", "php4", "php5", "phps",
    "asp", "aspx", "jsp", "exe", "bat", "sh", "cmd", "vbs", "com", "scr"
];

// Helper to recursively collect all descendant files/folders (inclusive of folderId structure)
export async function getAllDescendants(folderId: string, userId: string): Promise<any[]> {
    const result = await db.execute(sql`
        WITH RECURSIVE descendants AS (
            SELECT * FROM files WHERE parent_id = ${folderId} AND user_id = ${userId}
            UNION ALL
            SELECT f.* FROM files f
            INNER JOIN descendants d ON f.parent_id = d.id AND f.user_id = ${userId}
        )
        SELECT * FROM descendants;
    `);

    // Map snake_case database columns back to camelCase properties expected by our code
    return result.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        parentId: row.parent_id,
        name: row.name,
        type: row.type,
        size: Number(row.size),
        storagePath: row.storage_path,
        isFolder: row.is_folder === true || row.is_folder === 'true' || row.is_folder === 1,
        isDeleted: row.is_deleted === true || row.is_deleted === 'true' || row.is_deleted === 1,
        isFavorite: row.is_favorite === true || row.is_favorite === 'true' || row.is_favorite === 1,
        createdAt: row.created_at,
        deletedAt: row.deleted_at
    }));
}

// Helper to delete physical file on disk
async function deletePhysicalFile(storagePath: string | null) {
    if (!storagePath) return;
    try {
        const path = `uploads/${storagePath}`;
        await unlink(path);
        console.log(`Successfully deleted physical file: ${path}`);
    } catch (err: any) {
        console.error(`Failed to delete physical file ${storagePath}:`, err.message);
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

        const conditions = [eq(files.isDeleted, isTrash), eq(files.userId, user.id)];

        if (isFavorite) {
            conditions.push(eq(files.isFavorite, true));
        }

        if (search) {
            conditions.push(ilike(files.name, `%${search}%`));
        } else if (!isFavorite && !isRecent) {
            if (parentId) {
                conditions.push(eq(files.parentId, parentId));
            } else if (!isTrash) {
                conditions.push(isNull(files.parentId));
            }
        }

        let queryBuilder = db.select().from(files).where(and(...conditions));

        if (isRecent) {
            queryBuilder = queryBuilder.orderBy(desc(files.createdAt)).limit(20) as any;
        }

        const result = await queryBuilder;
        const baseUrl = new URL(request.url).origin;

        const data = await Promise.all(result.map(async (f) => {
            let previewUrl = null;
            if (f.storagePath) {
                // Buat token presigned URL valid 1 jam
                const token = await jwtPlugin.sign({ fileId: f.id, exp: Math.floor(Date.now() / 1000) + 3600 });
                previewUrl = `${baseUrl}/files/preview/${f.id}?token=${token}`;
            }
            return { ...f, previewUrl };
        }));

        return { data };
    })
    .patch("/:id/favorite", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const fileId = params.id;

        const existing = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.userId, user.id))).limit(1);
        if (existing.length === 0) {
            set.status = 404;
            return { error: "File not found" };
        }

        const fileItem = existing[0];
        const updated = await db.update(files)
            .set({ isFavorite: !fileItem.isFavorite })
            .where(eq(files.id, fileId))
            .returning();

        return { data: updated[0] };
    })
    .get("/preview/:id", async ({ params, query, jwtPlugin, set }) => {
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
        
        // Strict CSP to prevent script execution (stored XSS vector) in sandboxed browser frames
        set.headers["Content-Security-Policy"] = "default-src 'none'; sandbox;";
        set.headers["X-Content-Type-Options"] = "nosniff";
        
        // Bun.file otomatis mendukung header Range untuk seeking video/audio
        return Bun.file(`uploads/${file.storagePath}`);
    })
    .get("/:id/download", async (c) => {
        const user = await requireAuth(c);
        const { params, set } = c;
        const { id } = params;
        const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, user.id)));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }
        
        set.headers["Content-Disposition"] = `attachment; filename="${file.name}"`;
        return Bun.file(`uploads/${file.storagePath}`);
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

            // 5️⃣ SIMPAN FILE
            await mkdir(`uploads/${user.id}`, { recursive: true });
            await Bun.write(`uploads/${storagePath}`, uploadedFile);

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

            return { data: newFile };
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

            return { data: newFolder };
        },
        {
            body: t.Object({
                name: t.String(),
                parentId: t.Optional(t.String()),
            }),
        }
    )
    .delete("/:id", async (c) => {
        const user = await requireAuth(c);
        const { params, query, set } = c;
        const { id } = params;
        const permanent = query.permanent === 'true';

        const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, user.id)));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        if (permanent) {
            if (file.isFolder) {
                const descendants = await getAllDescendants(id, user.id);
                for (const d of descendants) {
                    if (!d.isFolder && d.storagePath) {
                        await deletePhysicalFile(d.storagePath);
                    }
                }
                const idsToDelete = [id, ...descendants.map(d => d.id)];
                await db.delete(files).where(inArray(files.id, idsToDelete));
            } else {
                await deletePhysicalFile(file.storagePath);
                await db.delete(files).where(eq(files.id, id));
            }
        } else {
            await db.update(files)
                .set({ isDeleted: true, deletedAt: new Date() })
                .where(eq(files.id, id));

            if (file.isFolder) {
                const descendants = await getAllDescendants(id, user.id);
                if (descendants.length > 0) {
                    const descendantIds = descendants.map(d => d.id);
                    await db.update(files)
                        .set({ isDeleted: true, deletedAt: new Date() })
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

        const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, user.id)));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        await db.update(files)
            .set({ isDeleted: false, deletedAt: null })
            .where(eq(files.id, id));

        if (file.isFolder) {
            const descendants = await getAllDescendants(id, user.id);
            if (descendants.length > 0) {
                const descendantIds = descendants.map(d => d.id);
                await db.update(files)
                    .set({ isDeleted: false, deletedAt: null })
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

        const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, user.id)));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
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

        const [file] = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, user.id)));
        if (!file) {
            set.status = 404;
            return { message: "File not found" };
        }

        if (targetFolderId) {
            const [targetFolder] = await db.select()
                .from(files)
                .where(and(eq(files.id, targetFolderId), eq(files.userId, user.id), eq(files.isFolder, true)));
            if (!targetFolder) {
                set.status = 400;
                return { message: "Target folder not found" };
            }

            if (file.isFolder) {
                if (id === targetFolderId) {
                    set.status = 400;
                    return { message: "Cannot move a folder inside itself" };
                }
                const descendants = await getAllDescendants(id, user.id);
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

        const trashItems = await db.select()
            .from(files)
            .where(and(eq(files.isDeleted, true), eq(files.userId, user.id)));

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
    });
