import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

function toBool(val: any): boolean {
    return val === true || val === 'true' || val === 1;
}

/**
 * Memeriksa apakah server Ceph RGW sedang online atau offline menggunakan HEAD request.
 * Dilengkapi cache 5 detik untuk menghindari spamming request.
 */
export async function checkStorageOnline(): Promise<boolean> {
    const now = Date.now();
    if (now - lastHealthCheckTime < 5000) {
        return isStorageOnlineCache;
    }

    const s3Endpoint = process.env.S3_ENDPOINT || "http://127.0.0.1:8000";
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout

        await fetch(s3Endpoint, { method: "GET", signal: controller.signal });
        clearTimeout(timeoutId);
        isStorageOnlineCache = true;
    } catch (err: any) {
        if (err?.code === "ECONNREFUSED" || err?.cause?.code === "ECONNREFUSED") {
            isStorageOnlineCache = false;
        } else {
            isStorageOnlineCache = true;
        }
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

    const promUrl = process.env.CEPH_PROM_URL || "http://127.0.0.1:9283/metrics";

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
        // Soft fallback jika Prometheus exporter offline
    }
    return lastCapacityCache;
}

export function fixHttpsUrl(url: string | null, requestHost?: string, requestProto?: string): string | null {
    if (!url) return null;

    let host = requestHost;
    let proto = requestProto;

    // Fallback ke .env jika header tidak terdeteksi (misal dari Postman/cURL)
    if (!host || !proto) {
        const frontendUrl = process.env.FRONTEND_URL || "https://100.83.191.96";
        if (!proto) proto = frontendUrl.startsWith("http://") ? "http" : "https";
        if (!host) host = frontendUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }

    // Bersihkan URL mentah dari AWS SDK
    const cleanUrl = url
        .replace(/^https?:\/\/[^\/]+:\d+\//, "")
        .replace(/^https?:\/\/[^\/]+\//, "")
        .replace(/^s3\//, "");

    return `${proto}://${host}/s3/${cleanUrl}`;
}

/**
 * Menghasilkan jalur avatar murni dari database.
 * Pemformatan URL proxy dilakukan secara terpusat oleh frontend formatAvatarUrl.
 */
export function getAvatarUrl(avatar: string | null): string | null {
    if (!avatar) return null;
    return avatar;
}

/**
 * Menghasilkan presigned URL untuk melihat pratinjau (inline) dan mengunduh berkas (attachment).
 * Valid selama 1 jam (3600 detik).
 */
export async function getPresignedUrls(storagePath: string | null, type: string | null, name: string, requestHost?: string, requestProto?: string) {
    if (!storagePath) return { previewUrl: null, downloadUrl: null };
    try {
        const previewCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storagePath,
            ResponseContentType: type || undefined,
            ResponseContentDisposition: "inline",
        });
        const rawPreviewUrl = await getSignedUrl(s3, previewCmd, { expiresIn: 3600 });

        const downloadCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storagePath,
            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(name)}"`,
        });
        const rawDownloadUrl = await getSignedUrl(s3, downloadCmd, { expiresIn: 3600 });

        let host = requestHost;
        let proto = requestProto || "https";
        if (!host) {
            const frontendUrl = process.env.FRONTEND_URL || "https://100.83.191.96";
            if (frontendUrl.startsWith("http://")) proto = "http";
            host = frontendUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
        }

        // Generate clean URLs that work across both proxy and direct routes
        const previewUrl = fixHttpsUrl(rawPreviewUrl, host, proto);
        const downloadUrl = fixHttpsUrl(rawDownloadUrl, host, proto);

        return { previewUrl, downloadUrl };
    } catch (err: any) {
        console.error(`Failed to generate presigned URLs for ${name}:`, err.message);
        return { previewUrl: null, downloadUrl: null };
    }
}

export async function getAllDescendants(folderId: string): Promise<Array<Record<string, any>>> {
    const result = await db.execute(sql`
        WITH RECURSIVE descendants AS (
            SELECT * FROM files WHERE parent_id = ${folderId}
            UNION ALL
            SELECT f.* FROM files f
            INNER JOIN descendants d ON f.parent_id = d.id
        )
        SELECT * FROM descendants;
    `);

    return result.map((row: Record<string, any>) => ({
        id: row.id,
        userId: row.user_id,
        parentId: row.parent_id,
        name: row.name,
        type: row.type,
        size: Number(row.size),
        storagePath: row.storage_path,
        isFolder: toBool(row.is_folder),
        isDeleted: toBool(row.is_deleted),
        isFavorite: toBool(row.is_favorite),
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
        deletedBy: row.deleted_by,
        allowEdit: toBool(row.allow_edit)
    }));
}

/**
 * Menghapus objek berkas secara fisik dari Ceph S3 dengan pencatatan logs detail.
 * Mengembalikan status boolean sukses/gagal agar caller dapat menangani status error.
 */
export async function deletePhysicalFile(storagePath: string | null, userId?: string): Promise<boolean> {
    if (!storagePath) return false;
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
        return true;
    } catch (err: any) {
        await writeLog("ERROR", "CEPH", `Failed to delete file from Ceph S3 ${storagePath}: ${err.message}`, {
            userId,
            errorStack: err.stack
        });
        return false;
    }
}
