import { eq, gt, lte, sql } from "drizzle-orm";
import { db, files, uploadReservations } from "../db";
import { assertQuotaCapacity, validateUploadSize } from "./storage-quota-policy";

const QUOTA_ADVISORY_LOCK_ID = 1380207461;
const RESERVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FileInsert = typeof files.$inferInsert;

async function acquireQuotaLock(tx: any): Promise<void> {
    // A transaction-scoped lock serializes every quota-changing upload operation
    // across backend instances without holding the lock while data is sent to Ceph.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUOTA_ADVISORY_LOCK_ID}::bigint)`);
}

export async function getStorageQuotaLimit(): Promise<number> {
    const configuredLimit = process.env.STORAGE_QUOTA_BYTES?.trim();

    if (configuredLimit) {
        const parsed = Number(configuredLimit);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            throw new Error("STORAGE_QUOTA_BYTES must be a positive integer expressed in bytes.");
        }
        return parsed;
    }

    // Load Ceph integration only when no explicit quota override is configured.
    const { getCephCapacity } = await import("./ceph");
    const capacity = Math.floor(await getCephCapacity());
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
        throw new Error("Unable to determine a valid storage quota limit.");
    }
    return capacity;
}

async function getStorageUsage(tx: any, now: Date) {
    const [usedRow] = await tx
        .select({
            bytes: sql<string>`COALESCE(SUM(${files.size}), 0)::text`,
        })
        .from(files)
        .where(eq(files.isDeleted, false));

    const [reservedRow] = await tx
        .select({
            bytes: sql<string>`COALESCE(SUM(${uploadReservations.reservedBytes}), 0)::text`,
        })
        .from(uploadReservations)
        .where(gt(uploadReservations.expiresAt, now));

    const usedBytes = Number(usedRow?.bytes ?? "0");
    const reservedBytes = Number(reservedRow?.bytes ?? "0");

    if (!Number.isSafeInteger(usedBytes) || usedBytes < 0 ||
        !Number.isSafeInteger(reservedBytes) || reservedBytes < 0) {
        throw new Error("Storage usage is outside the supported safe integer range.");
    }

    return { usedBytes, reservedBytes };
}

async function removeExpiredReservations(tx: any, now: Date): Promise<void> {
    await tx.delete(uploadReservations).where(lte(uploadReservations.expiresAt, now));
}

/**
 * Reserve global logical storage before starting an upload.
 * The reservation prevents concurrent requests from oversubscribing the quota.
 */
export async function reserveUploadSpace(
    userId: string,
    storagePath: string,
    requestedBytes: number,
): Promise<string> {
    const size = validateUploadSize(requestedBytes);
    const limitBytes = await getStorageQuotaLimit();

    return db.transaction(async (tx) => {
        await acquireQuotaLock(tx);
        const now = new Date();
        await removeExpiredReservations(tx, now);

        const { usedBytes, reservedBytes } = await getStorageUsage(tx, now);
        assertQuotaCapacity(limitBytes, usedBytes, reservedBytes, size);

        const [reservation] = await tx
            .insert(uploadReservations)
            .values({
                userId,
                storagePath,
                reservedBytes: size,
                expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
            })
            .returning({ id: uploadReservations.id });

        if (!reservation) {
            throw new Error("Failed to create storage quota reservation.");
        }

        return reservation.id;
    });
}

/**
 * Atomically convert a reservation into a file metadata row.
 * The total (used + reserved) does not temporarily increase during finalization.
 */
export async function finalizeUploadReservation(
    reservationId: string,
    values: FileInsert,
) {
    const size = validateUploadSize(Number(values.size));
    const limitBytes = await getStorageQuotaLimit();

    return db.transaction(async (tx) => {
        await acquireQuotaLock(tx);
        const now = new Date();

        const [reservation] = await tx
            .select()
            .from(uploadReservations)
            .where(eq(uploadReservations.id, reservationId))
            .limit(1);

        if (!reservation || reservation.expiresAt.getTime() <= now.getTime()) {
            throw new Error("Storage quota reservation is missing or expired.");
        }

        if (size > reservation.reservedBytes) {
            throw new Error("Uploaded file exceeds its reserved storage quota.");
        }

        const { usedBytes, reservedBytes } = await getStorageUsage(tx, now);
        const otherReservations = Math.max(0, reservedBytes - reservation.reservedBytes);
        assertQuotaCapacity(limitBytes, usedBytes, otherReservations, size);

        const [createdFile] = await tx.insert(files).values(values).returning();
        await tx.delete(uploadReservations).where(eq(uploadReservations.id, reservationId));
        return createdFile;
    });
}

/**
 * Insert metadata for a direct-to-Ceph upload while atomically checking quota.
 * The metadata row itself accounts for the declared object size.
 */
export async function insertFileWithinQuota(values: FileInsert) {
    const size = validateUploadSize(Number(values.size));
    const limitBytes = await getStorageQuotaLimit();

    return db.transaction(async (tx) => {
        await acquireQuotaLock(tx);
        const now = new Date();
        await removeExpiredReservations(tx, now);

        const { usedBytes, reservedBytes } = await getStorageUsage(tx, now);
        assertQuotaCapacity(limitBytes, usedBytes, reservedBytes, size);

        const [createdFile] = await tx.insert(files).values(values).returning();
        return createdFile;
    });
}

export async function releaseUploadReservation(reservationId: string): Promise<void> {
    await db.delete(uploadReservations).where(eq(uploadReservations.id, reservationId));
}
