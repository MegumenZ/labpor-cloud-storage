import { mkdir, unlink } from "fs/promises";
import { Elysia, t } from "elysia";
import { db, files, users } from "../db";
import { eq, and, isNull, ilike, inArray } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";

// Helper to recursively collect all descendant files/folders (inclusive of folderId structure)
async function getAllDescendants(folderId: string, userId: string): Promise<any[]> {
    const descendants: any[] = [];
    const queue = [folderId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = await db.select()
            .from(files)
            .where(and(eq(files.parentId, currentId), eq(files.userId, userId)));
        
        for (const child of children) {
            descendants.push(child);
            if (child.isFolder) {
                queue.push(child.id);
            }
        }
    }
    return descendants;
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

const getUserFromAuth = async (jwt: any, headers: any, set: any) => {
    const token = headers.authorization?.split(" ")[1];
    if (!token) {
        set.status = 401;
        throw new Error("Unauthorized");
    }

    const user = await jwt.verify(token);
    if (!user) {
        set.status = 401;
        throw new Error("Unauthorized");
    }

    return user;
};

export const filesRoutes = new Elysia({ prefix: "/files" })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
        })
    )
    .get("/", async ({ query, request, jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);
        const parentId = query.parentId ? String(query.parentId) : (query.folderId ? String(query.folderId) : null);
        const search = query.search ? String(query.search) : null;
        const isTrash = query.trash === 'true';

        const conditions = [eq(files.isDeleted, isTrash), eq(files.userId, user.id)];

        if (search) {
            conditions.push(ilike(files.name, `%${search}%`));
        } else {
            if (parentId) {
                conditions.push(eq(files.parentId, parentId));
            } else if (!isTrash) {
                conditions.push(isNull(files.parentId));
            }
        }

        const result = await db.select().from(files).where(and(...conditions));

        const baseUrl = new URL(request.url).origin;

        const data = await Promise.all(result.map(async (f) => {
            let previewUrl = null;
            if (f.storagePath) {
                // Buat token presigned URL valid 1 jam
                const token = await jwt.sign({ fileId: f.id, exp: Math.floor(Date.now() / 1000) + 3600 });
                previewUrl = `${baseUrl}/files/preview/${f.id}?token=${token}`;
            }
            return { ...f, previewUrl };
        }));

        return { data };
    })
    .get("/preview/:id", async ({ params, query, jwt, set }) => {
        const { id } = params;
        const { token } = query as { token?: string };
        if (!token) {
            set.status = 401;
            return { message: "Unauthorized: Missing presigned token" };
        }
        
        const payload = await jwt.verify(token);
        if (!payload || payload.fileId !== id) {
            set.status = 401;
            return { message: "Unauthorized: Invalid or expired presigned token" };
        }
        
        const [file] = await db.select().from(files).where(eq(files.id, id));
        if (!file || !file.storagePath) {
            set.status = 404;
            return { message: "File not found" };
        }
        
        // Bun.file otomatis mendukung header Range untuk seeking video/audio
        return Bun.file(`uploads/${file.storagePath}`);
    })
    .get("/:id/download", async ({ params, jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);
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
        async ({ body, jwt, headers, set }) => {
            const user = await getUserFromAuth(jwt, headers, set);
            const uploadedFile = body.file as File;

            // 1️⃣ VALIDASI UKURAN (Diatur tinggi karena akan terhubung ke Ceph, misal 5GB)
            const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
            if (uploadedFile.size > MAX_SIZE) {
                set.status = 400;
                return { message: "File size exceeds 5GB" };
            }

            // 2️⃣ VALIDASI NAMA FILE (MINIMAL)
            if (!uploadedFile.name || uploadedFile.name.includes("..")) {
                set.status = 400;
                return { message: "Invalid file name" };
            }

            // 3️⃣ AMANKAN PATH (PER USER)
            const extension = uploadedFile.name.split(".").pop();
            const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const storagePath = `${user.id}/${safeFileName}`;

            // 4️⃣ SIMPAN FILE
            await mkdir(`uploads/${user.id}`, { recursive: true });
            await Bun.write(`uploads/${storagePath}`, uploadedFile);

            // 5️⃣ SIMPAN KE DATABASE
            const [newFile] = await db.insert(files).values({
                name: uploadedFile.name,
                type: uploadedFile.type,
                size: String(uploadedFile.size),
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
        async ({ body, jwt, headers, set }) => {
            const user = await getUserFromAuth(jwt, headers, set);

            const [newFolder] = await db.insert(files).values({
                name: body.name,
                type: "folder",
                size: "0",
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
    .delete("/:id", async ({ params, query, jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);
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
    .post("/:id/restore", async ({ params, jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);
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
    .put("/:id/rename", async ({ params, body, jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);
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
    .put("/:id/move", async ({ params, body, jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);
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
    .delete("/trash", async ({ jwt, headers, set }) => {
        const user = await getUserFromAuth(jwt, headers, set);

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
