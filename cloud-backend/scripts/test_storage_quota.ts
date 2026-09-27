import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { files, uploadReservations, users } from "../src/database/schema";
import { StorageQuotaExceededError } from "../src/utils/storage-quota-policy";

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

process.env.DATABASE_URL = testDatabaseUrl;

const testClient = postgres(testDatabaseUrl, { max: 1 });
const testDb = drizzle(testClient);

async function main() {
    let testUserId: string | undefined;
    let serviceClient: { end: () => Promise<void> } | undefined;
    const reservationIds: string[] = [];

    try {
        console.log("Setting up isolated storage quota test data...");

        const [testUser] = await testDb
            .insert(users)
            .values({
                username: `storage_quota_test_${crypto.randomUUID()}`,
                password: "test-only-not-a-real-password",
                displayName: "Storage Quota Test",
            })
            .returning({ id: users.id });

        testUserId = testUser.id;

        const [baselineRow] = await testDb
            .select({
                bytes: sql<string>`COALESCE(SUM(${files.size}), 0)::text`,
            })
            .from(files)
            .where(eq(files.isDeleted, false));

        const baselineBytes = Number(baselineRow?.bytes ?? "0");
        if (!Number.isSafeInteger(baselineBytes) || baselineBytes < 0) {
            throw new Error("Test database storage usage is outside the supported range.");
        }

        // Allow exactly ten additional bytes over the existing isolated test DB usage.
        process.env.STORAGE_QUOTA_BYTES = String(baselineBytes + 10);

        const quota = await import("../src/utils/storage-quota");
        const connection = await import("../src/database/connection");
        serviceClient = connection.client;

        const pathA = `quota-test/${crypto.randomUUID()}.bin`;
        const pathB = `quota-test/${crypto.randomUUID()}.bin`;

        const attempts = await Promise.allSettled([
            quota.reserveUploadSpace(testUserId, pathA, 10).then((id) => ({ id, storagePath: pathA })),
            quota.reserveUploadSpace(testUserId, pathB, 10).then((id) => ({ id, storagePath: pathB })),
        ]);

        const accepted = attempts.filter(
            (result): result is PromiseFulfilledResult<{ id: string; storagePath: string }> =>
                result.status === "fulfilled",
        );
        const rejected = attempts.filter((result) => result.status === "rejected");

        for (const result of accepted) reservationIds.push(result.value.id);

        if (accepted.length !== 1 || rejected.length !== 1 ||
            !(rejected[0].reason instanceof StorageQuotaExceededError)) {
            throw new Error("Concurrent quota reservation did not allow exactly one 10-byte upload.");
        }

        const winner = accepted[0].value;
        await quota.finalizeUploadReservation(winner.id, {
            name: "quota-test.bin",
            type: "application/octet-stream",
            size: 10,
            userId: testUserId,
            isFolder: false,
            storagePath: winner.storagePath,
        });
        reservationIds.splice(reservationIds.indexOf(winner.id), 1);

        let rejectedAfterCommit = false;
        try {
            const extraReservation = await quota.reserveUploadSpace(
                testUserId,
                `quota-test/${crypto.randomUUID()}.bin`,
                1,
            );
            reservationIds.push(extraReservation);
        } catch (error) {
            if (error instanceof StorageQuotaExceededError) {
                rejectedAfterCommit = true;
            } else {
                throw error;
            }
        }

        if (!rejectedAfterCommit) {
            throw new Error("Quota allowed another upload after the test capacity was fully used.");
        }

        console.log("SUCCESS: Concurrent reservations did not oversubscribe quota.");
        console.log("SUCCESS: Finalizing a reservation preserved the quota accounting.");
        console.log("SUCCESS: A new upload was rejected after capacity was exhausted.");
    } finally {
        if (testUserId) {
            await testDb.delete(uploadReservations).where(eq(uploadReservations.userId, testUserId));
            await testDb.delete(files).where(eq(files.userId, testUserId));
            await testDb.delete(users).where(eq(users.id, testUserId));
        }
        if (serviceClient) await serviceClient.end();
        await testClient.end();
    }
}

main().catch((error) => {
    console.error("Storage quota test failed:", error);
    process.exitCode = 1;
});
