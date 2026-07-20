import { db, users, files } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { getAvatarUrl, getCephCapacity, checkStorageOnline } from "./ceph";

export async function getUserDashboardData(userId: string) {
    try {
        // Fetch full user details
        const [user] = await db.select().from(users).where(eq(users.id, userId));

        if (!user) {
            return null;
        }

        let totalFiles = 0;
        let usedStorage = 0;

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

        try {
            const [systemStorageResult] = await db
                .select({
                    usedStorage: sql`coalesce(sum(${files.size}), 0)`,
                })
                .from(files)
                .where(eq(files.isDeleted, false));

            usedStorage = Number(systemStorageResult?.usedStorage || 0);
        } catch (e) {
            console.warn("[Dashboard] Failed to fetch usedStorage:", e);
        }

        const avatarUrl = await getAvatarUrl(user.avatar).catch(() => user.avatar);
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
            usedStorage,
            storageLimit,
            storageOnline,
            themePreference: user.themePreference,
        };
    } catch (err) {
        console.error("[getUserDashboardData CRITICAL ERROR]", err);
        throw err;
    }
}
