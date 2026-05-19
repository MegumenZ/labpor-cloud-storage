import { mkdir } from "fs/promises";
import { Elysia, t } from "elysia";
import { db, files, users } from "../db";
import { eq, and, isNull, ilike } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";

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
    .get("/", async ({ query, request }) => {
        const parentId = query.parentId ? String(query.parentId) : (query.folderId ? String(query.folderId) : null);
        const search = query.search ? String(query.search) : null;
        const isTrash = query.trash === 'true';

        const conditions = [eq(files.isDeleted, isTrash)];

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

        const data = result.map(f => ({
            ...f,
            previewUrl: f.storagePath ? `${baseUrl}/uploads/${f.storagePath}` : null
        }));

        return { data };
    })
    .post(
        "/upload-local",
        async ({ body, jwt, headers, set }) => {
            const user = await getUserFromAuth(jwt, headers, set);
            const uploadedFile = body.file as File;

            // 1️⃣ VALIDASI UKURAN (50MB)
            const MAX_SIZE = 50 * 1024 * 1024;
            if (uploadedFile.size > MAX_SIZE) {
                set.status = 400;
                return { message: "File size exceeds 50MB" };
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
    .delete("/:id", async ({ params, query }) => {
        const { id } = params;
        const permanent = query.permanent === 'true';

        if (permanent) {
            await db.delete(files).where(eq(files.id, id));
        } else {
            await db.update(files)
                .set({ isDeleted: true, deletedAt: new Date() })
                .where(eq(files.id, id));
        }

        return { message: "File deleted" };
    })
    .post("/:id/restore", async ({ params }) => {
        const { id } = params;
        await db.update(files)
            .set({ isDeleted: false, deletedAt: null })
            .where(eq(files.id, id));
        return { message: "File restored" };
    })
    .put("/:id/rename", async ({ params, body }) => {
        const { id } = params;
        const { newName } = body as { newName: string };
        await db.update(files)
            .set({ name: newName })
            .where(eq(files.id, id));
        return { message: "File renamed" };
    })
    .delete("/trash", async () => {
        // Empty trash
        await db.delete(files).where(eq(files.isDeleted, true));
        return { message: "Trash emptied" };
    });
