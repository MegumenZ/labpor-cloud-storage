import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET_NAME } from "../files/s3";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { writeLog } from "./logger";

// Cache variables for dynamic storage capacity & online status checks
let lastCapacityCache = 130 * 1024 * 1024 * 1024; // Default to 130 GB in bytes
let lastCacheTime = 0;

let isStorageOnlineCache = true;
let lastHealthCheckTime = 0;

/**
 * Memeriksa apakah server Ceph RGW sedang online atau offline menggunakan HEAD request.
 * Dilengkapi cache 5 detik untuk menghindari spamming request.
 */
export async function checkStorageOnline(): Promise<boolean> {
    const now = Date.now();
    if (now - lastHealthCheckTime < 5000) {
        return isStorageOnlineCache;
    }

    const s3Endpoint = process.env.S3_ENDPOINT || "http://192.168.100.53:80";
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1.0 second timeout

        await fetch(s3Endpoint, { method: "HEAD", signal: controller.signal });
        clearTimeout(timeoutId);
        isStorageOnlineCache = true;
    } catch (err) {
        isStorageOnlineCache = false;
    }
    lastHealthCheckTime = now;
    return isStorageOnlineCache;
}

/**
 * Mengambil total kapasitas penyimpanan cluster Ceph dari Prometheus exporter.
 * Dilengkapi cache 30 detik untuk mengoptimalkan performa.
 */
export async function getCephCapacity(): Promise<number> {
    const CACHE_DURATION = 30 * 1000;
    const now = Date.now();
    if (now - lastCacheTime < CACHE_DURATION) {
        return lastCapacityCache;
    }

    const promUrl = process.env.CEPH_PROM_URL || "http://192.168.100.53:9283/metrics";

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 seconds timeout

        const res = await fetch(promUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const text = await res.text();
        const match = text.match(/^ceph_cluster_total_bytes\s+([\d.e+]+)/m);
        if (match && match[1]) {
            const val = parseFloat(match[1]);
            if (!isNaN(val) && val > 0) {
                lastCapacityCache = val;
                lastCacheTime = now;
                return val;
            }
        }
    } catch (err: any) {
        console.warn(`[Ceph Monitor] Failed to fetch raw cluster capacity: ${err.message}. Using cached limit: ${(lastCapacityCache / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    }

    return lastCapacityCache;
}

/**
 * Menghasilkan URL bertanda tangan (presigned URL) untuk avatar pengguna yang disimpan di Ceph.
 * Valid selama 24 jam.
 */
export async function getAvatarUrl(avatar: string | null): Promise<string | null> {
    if (!avatar) return null;
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
        return avatar;
    }
    // Return relative path. The frontend will prepend baseUrl + "/uploads/avatars/".
    // This allows same-origin HTTPS proxying via our backend.
    return avatar;
}

/**
 * Menghasilkan presigned URL untuk melihat pratinjau (inline) dan mengunduh berkas (attachment).
 * Valid selama 1 jam (3600 detik).
 */
export async function getPresignedUrls(storagePath: string | null, type: string | null, name: string) {
    if (!storagePath) return { previewUrl: null, downloadUrl: null };
    try {
        const previewCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storagePath,
            ResponseContentType: type || undefined,
            ResponseContentDisposition: "inline",
        });
        const previewUrl = await getSignedUrl(s3, previewCmd, { expiresIn: 3600 });

        const downloadCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storagePath,
            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(name)}"`,
        });
        const downloadUrl = await getSignedUrl(s3, downloadCmd, { expiresIn: 3600 });

        return { previewUrl, downloadUrl };
    } catch (err: any) {
        console.error(`Failed to generate presigned URLs for ${name}:`, err.message);
        return { previewUrl: null, downloadUrl: null };
    }
}

/**
 * Mengambil seluruh keturunan folder secara rekursif dari database PostgreSQL.
 */
export async function getAllDescendants(folderId: string): Promise<any[]> {
    const result = await db.execute(sql`
        WITH RECURSIVE descendants AS (
            SELECT * FROM files WHERE parent_id = ${folderId}
            UNION ALL
            SELECT f.* FROM files f
            INNER JOIN descendants d ON f.parent_id = d.id
        )
        SELECT * FROM descendants;
    `);

    return result.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        parentId: row.parent_id,
        name: row.name,
        type: row.type,
        size: Number(row.size),
        storagePath: row.storage_path,
        isFolder: row.is_folder === true || row.is_folder === 'true' || row.is_folder === 1,
        isDeleted: row.is_deleted === true || row.is_deleted === 'true' || row.is_deleted === 1,
        isFavorite: row.is_favorite === true || row.is_favorite === 'true' || row.is_favorite === 1,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
        deletedBy: row.deleted_by,
        allowEdit: row.allow_edit === true || row.allow_edit === 'true' || row.allow_edit === 1
    }));
}

/**
 * Menghapus objek berkas secara fisik dari Ceph S3 dengan pencatatan logs detail.
 */
export async function deletePhysicalFile(storagePath: string | null, userId?: string) {
    if (!storagePath) return;
    try {
        const start = Date.now();
        await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storagePath
        }));
        const duration = Date.now() - start;
        await writeLog("INFO", "CEPH", `Deleted file from Ceph S3: ${storagePath}`, {
            userId,
            elapsedMs: duration,
            metadata: { bucket: BUCKET_NAME, key: storagePath }
        });
    } catch (err: any) {
        await writeLog("ERROR", "CEPH", `Failed to delete file from Ceph S3 ${storagePath}: ${err.message}`, {
            userId,
            errorStack: err.stack
        });
    }
}
