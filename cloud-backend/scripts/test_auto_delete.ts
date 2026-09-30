import { and, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { files, users } from "../src/database/schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
    throw new Error(
        "TEST_DATABASE_URL is required. Use an isolated test database; DATABASE_URL is intentionally not accepted.",
    );
}

const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/(^|[_-])(test|testing|ci)([_-]|$)/i.test(databaseName)) {
    throw new Error(
        `Refusing to run against database "${databaseName}". The database name must contain a test/testing/ci segment.`,
    );
}

const client = postgres(testDatabaseUrl, { max: 1 });
const testDb = drizzle(client);

async function main() {
    let testUserId: string | undefined;

    try {
        console.log("Setting up isolated auto-delete test data...");

        const username = `auto_delete_test_${crypto.randomUUID()}`;
        const [testUser] = await testDb
            .insert(users)
            .values({
                username,
                password: "test-only-not-a-real-password",
                displayName: "Auto Delete Test",
            })
            .returning({ id: users.id });

        testUserId = testUser.id;

        const now = Date.now();
        const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000);
        const twentyNineDaysAgo = new Date(now - 29 * 24 * 60 * 60 * 1000);

        const [expiredFile] = await testDb
            .insert(files)
            .values({
                name: "old_trash_file.txt",
                type: "text/plain",
                size: 100,
                userId: testUserId,
                isDeleted: true,
                deletedAt: thirtyOneDaysAgo,
            })
            .returning({ id: files.id });

        const [recentFile] = await testDb
            .insert(files)
            .values({
                name: "recent_trash_file.txt",
                type: "text/plain",
                size: 100,
                userId: testUserId,
                isDeleted: true,
                deletedAt: twentyNineDaysAgo,
            })
            .returning({ id: files.id });

        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const deletedRows = await testDb
            .delete(files)
            .where(
                and(
                    eq(files.id, expiredFile.id),
                    eq(files.isDeleted, true),
                    lt(files.deletedAt, cutoff),
                ),
            )
            .returning({ id: files.id });

        const [checkExpired] = await testDb
            .select({ id: files.id })
            .from(files)
            .where(eq(files.id, expiredFile.id));

        const [checkRecent] = await testDb
            .select({ id: files.id })
            .from(files)
            .where(eq(files.id, recentFile.id));

        if (deletedRows.length !== 1 || checkExpired) {
            throw new Error("FAILURE: The expired test file was not deleted as expected.");
        }
        if (!checkRecent) {
            throw new Error("FAILURE: The recent test file was deleted unexpectedly.");
        }

        console.log("SUCCESS: Expired test file was deleted.");
        console.log("SUCCESS: Recent test file was preserved.");
    } finally {
        // Remove only rows belonging to the uniquely created test user.
        try {
            if (testUserId) {
                await testDb.delete(files).where(eq(files.userId, testUserId));
                await testDb.delete(users).where(eq(users.id, testUserId));
            }
        } finally {
            await client.end();
        }
    }
}

main().catch((error) => {
    console.error("Auto-delete test failed:", error);
    process.exitCode = 1;
});
