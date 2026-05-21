import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { authRoutes } from "./auth";
import { filesRoutes } from "./files";
import { usersRoutes } from "./users";

import { cron } from "@elysiajs/cron";
import { db, files } from "./db";
import { eq, lt, and } from "drizzle-orm";
import { unlink } from "fs/promises";

const app = new Elysia({
    bodyLimit: 1024 * 1024 * 1024 * 5, // 5GB in bytes
    serve: {
        maxRequestBodySize: 1024 * 1024 * 1024 * 5 // 5GB in bytes
    }
})
    .use(cors({
        origin: "http://localhost:5173",
        credentials: true,
    }))
    .use(swagger())
    .use(staticPlugin({
        assets: "uploads",
        prefix: "/uploads"
    }))
    .use(
        cron({
            name: "auto-delete-trash",
            pattern: "0 0 * * *", // Run every day at midnight
            async run() {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                console.log("Running auto-deletion job...");

                // Get all files targeted for deletion
                const filesToDelete = await db.select()
                    .from(files)
                    .where(
                        and(
                            eq(files.isDeleted, true),
                            lt(files.deletedAt, thirtyDaysAgo)
                        )
                    );

                // Unlink each physical file
                for (const file of filesToDelete) {
                    if (!file.isFolder && file.storagePath) {
                        try {
                            const path = `uploads/${file.storagePath}`;
                            await unlink(path);
                            console.log(`Successfully auto-deleted physical file: ${path}`);
                        } catch (err: any) {
                            console.error(`Failed to auto-delete physical file ${file.storagePath}:`, err.message);
                        }
                    }
                }

                const result = await db.delete(files)
                    .where(
                        and(
                            eq(files.isDeleted, true),
                            lt(files.deletedAt, thirtyDaysAgo)
                        )
                    )
                    .returning();
                console.log(`Auto-deleted ${result.length} files.`);
            }
        })
    )
    .use(authRoutes)
    .use(filesRoutes)
    .use(usersRoutes)
    .get("/", () => "Hello Elysia")
    .listen(3000);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
