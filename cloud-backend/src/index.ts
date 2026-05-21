import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { authRoutes } from "./auth";
import { filesRoutes } from "./files";
import { usersRoutes } from "./users";
import { AuthenticationError, authPlugin } from "./auth/middleware";

import { cron } from "@elysiajs/cron";
import { db, files } from "./db";
import { eq, lt, and, inArray } from "drizzle-orm";
import { unlink } from "fs/promises";
import { getAllDescendants } from "./files";

const app = new Elysia({
    serve: {
        maxRequestBodySize: 1024 * 1024 * 1024 * 5 // 5GB in bytes
    }
})
    .use(cors({
        origin: process.env.ALLOWED_ORIGINS || "http://localhost:5173",
        credentials: true,
    }))
    .use(authPlugin)
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

                // 1. Get all root files/folders targeted for deletion
                const rootItemsToDelete = await db.select()
                    .from(files)
                    .where(
                        and(
                            eq(files.isDeleted, true),
                            lt(files.deletedAt, thirtyDaysAgo)
                        )
                    );

                if (rootItemsToDelete.length > 0) {
                    const allTargetIds = new Set<string>();
                    const physicalFilesToDelete = new Set<string>();

                    for (const item of rootItemsToDelete) {
                        allTargetIds.add(item.id);
                        if (!item.isFolder && item.storagePath) {
                            physicalFilesToDelete.add(item.storagePath);
                        }

                        // Collect descendants recursively if it's a folder
                        if (item.isFolder) {
                            const descendants = await getAllDescendants(item.id, item.userId);
                            for (const d of descendants) {
                                allTargetIds.add(d.id);
                                if (!d.isFolder && d.storagePath) {
                                    physicalFilesToDelete.add(d.storagePath);
                                }
                            }
                        }
                    }

                    // 2. Unlink physical files on disk
                    for (const storagePath of physicalFilesToDelete) {
                        try {
                            const path = `uploads/${storagePath}`;
                            await unlink(path);
                            console.log(`Successfully auto-deleted physical file: ${path}`);
                        } catch (err: any) {
                            console.error(`Failed to auto-delete physical file ${storagePath}:`, err.message);
                        }
                    }

                    const targetIdsArray = Array.from(allTargetIds);

                    if (targetIdsArray.length > 0) {
                        // 3. Temporarily set parentId to null to avoid FK constraint violations
                        await db.update(files)
                            .set({ parentId: null })
                            .where(inArray(files.id, targetIdsArray));

                        // 4. Delete records from database
                        const deletedResult = await db.delete(files)
                            .where(inArray(files.id, targetIdsArray))
                            .returning();

                        console.log(`Auto-deleted ${deletedResult.length} file/folder records from database.`);
                    }
                } else {
                    console.log("No files/folders to delete.");
                }
            }
        })
    )
    .use(authRoutes)
    .use(filesRoutes)
    .use(usersRoutes)
    .onError(({ error, set }) => {
        if (error instanceof AuthenticationError) {
            set.status = 401;
            return { message: error.message };
        }
        console.error("Unhandled server error:", error);
        return { message: "Internal Server Error" };
    })
    .get("/", () => "Hello Elysia")
    .listen(3000);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
