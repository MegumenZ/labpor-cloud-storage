import { db, users, files } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { getAvatarUrl, getCephCapacity, checkStorageOnline } from "./ceph";

// In-Memory Cache for Universal Storage (60 seconds TTL) to prevent expensive full-table scans
let cachedUsedStorage: { value: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateStorageCache() {
    cachedUsedStorage = null;
}

async function getSystemUsedStorage(): Promise<number | null> {
    if (cachedUsedStorage && (Date.now() - cachedUsedStorage.timestamp < CACHE_TTL_MS)) {
        return cachedUsedStorage.value;
    }

    try {
        const [result] = await db
            .select({
                usedStorage: sql<string>`coalesce(sum(${files.size}), 0::bigint)::text`,
            })
            .from(files)
            .where(eq(files.isDeleted, false));

        const totalBytes = Number(result?.usedStorage ?? "0");
        cachedUsedStorage = { value: totalBytes, timestamp: Date.now() };
        return totalBytes;
    } catch (e) {
        console.error("[Dashboard] Failed to fetch usedStorage:", e);
        return null;
    }
}

export async function getUserDashboardData(userId: string) {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, userId));

        if (!user) {
            return null;
        }

        let totalFiles = 0;

        try {
            const [userFilesResult] = await db
                .select({
                    totalFiles: sql<number>`count(${files.id})::int`,
                })
                .from(files)
                .where(and(eq(files.userId, user.id), eq(files.isDeleted, false)));

            totalFiles = userFilesResult?.totalFiles || 0;
        } catch (e) {
            console.warn("[Dashboard] Failed to fetch totalFiles:", e);
        }

        const usedStorage = await getSystemUsedStorage();
        const avatarUrl = getAvatarUrl(user.avatar) || user.avatar;
        const rawLimit = await getCephCapacity().catch(() => 130 * 1024 * 1024 * 1024);
        const storageLimit = (rawLimit && rawLimit > 0) ? rawLimit : 130 * 1024 * 1024 * 1024;
        const storageOnline = await checkStorageOnline().catch(() => true);

        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: avatarUrl,
            createdAt: user.createdAt,
            totalFiles,
            usedStorage: usedStorage !== null ? usedStorage : 0,
            storageLimit,
            storageOnline,
            themePreference: user.themePreference,
        };
    } catch (err) {
        console.error("[getUserDashboardData CRITICAL ERROR]", err);
        throw err;
    }
}
