import { db, files, users } from "./src/db";
import { eq, lt, and } from "drizzle-orm";

async function main() {
    console.log("Setting up test data...");

    // 1. Get a user
    const [user] = await db.select().from(users).limit(1);
    if (!user) {
        console.error("No user found to attach file to.");
        return;
    }

    // 2. Insert a file that was "deleted" 31 days ago
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    const [oldFile] = await db.insert(files).values({
        name: "old_trash_file.txt",
        type: "text/plain",
        size: "100",
        userId: user.id,
        isDeleted: true,
        deletedAt: thirtyOneDaysAgo,
    }).returning();

    console.log(`Inserted file: ${oldFile.id} with deletedAt: ${oldFile.deletedAt}`);

    // 3. Insert a file that was "deleted" 29 days ago (should NOT be deleted)
    const twentyNineDaysAgo = new Date();
    twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29);

    const [recentFile] = await db.insert(files).values({
        name: "recent_trash_file.txt",
        type: "text/plain",
        size: "100",
        userId: user.id,
        isDeleted: true,
        deletedAt: twentyNineDaysAgo,
    }).returning();

    console.log(`Inserted file: ${recentFile.id} with deletedAt: ${recentFile.deletedAt}`);

    // 4. Run the deletion logic (simulating the cron job)
    console.log("Running deletion logic...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db.delete(files)
        .where(
            and(
                eq(files.isDeleted, true),
                lt(files.deletedAt, thirtyDaysAgo)
            )
        )
        .returning();

    console.log(`Deleted ${result.length} files.`);

    // 5. Verify
    const checkOld = await db.select().from(files).where(eq(files.id, oldFile.id));
    const checkRecent = await db.select().from(files).where(eq(files.id, recentFile.id));

    if (checkOld.length === 0) {
        console.log("SUCCESS: Old file was deleted.");
    } else {
        console.error("FAILURE: Old file was NOT deleted.");
    }

    if (checkRecent.length > 0) {
        console.log("SUCCESS: Recent file was preserved.");
    } else {
        console.error("FAILURE: Recent file was deleted.");
    }

    // Cleanup
    if (checkRecent.length > 0) {
        await db.delete(files).where(eq(files.id, recentFile.id));
    }
}

main();
