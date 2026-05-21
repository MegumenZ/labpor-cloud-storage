import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db, rateLimits } from "../db";
import { eq } from "drizzle-orm";

if (!process.env.JWT_SECRET) {
    throw new Error("CRITICAL: JWT_SECRET environment variable is missing! Server cannot start safely.");
}

export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthenticationError";
    }
}

// authPlugin menyediakan jwtPlugin secara terpusat untuk rute yang di-use
export const authPlugin = new Elysia()
    .use(
        jwt({
            name: "jwtPlugin",
            secret: process.env.JWT_SECRET,
        })
    );

// Fungsi utilitas murni requireAuth - 100% Anti-Gagal di runtime
export async function requireAuth(context: any) {
    const { jwtPlugin, headers, cookie, set } = context;
    
    if (!jwtPlugin) {
        set.status = 500;
        throw new Error("Internal Server Error: jwtPlugin is missing in context");
    }

    let token: string | undefined = undefined;
    
    const cookieToken = cookie.token?.value;
    if (typeof cookieToken === "string") {
        token = cookieToken;
    }
    
    if (!token) {
        const authHeader = headers["authorization"];
        if (typeof authHeader === "string") {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        set.status = 401;
        throw new AuthenticationError("Unauthorized: Missing token");
    }

    const payload = await jwtPlugin.verify(token);
    if (!payload) {
        set.status = 401;
        throw new AuthenticationError("Unauthorized: Invalid token");
    }

    return payload as { id: string; username: string };
}

/**
 * Pembuat middleware pembatas laju request (Rate Limiter) berbasis IP klien dengan PostgreSQL.
 * Aman dari restart server, persisten, dan 100% bebas biaya/infrastruktur tambahan.
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
    return async ({ request, set }: any) => {
        // Dapatkan IP klien. Prioritaskan Header x-forwarded-for jika di belakang Nginx/reverse proxy
        const rawIp = request.headers?.get("x-forwarded-for") || "127.0.0.1";
        const ip = rawIp.split(",")[0].trim();
        
        const now = new Date();
        const nowMs = now.getTime();

        try {
            // 1. Ambil rekaman rate limit dari database berdasarkan IP
            const [record] = await db.select().from(rateLimits).where(eq(rateLimits.ip, ip)).limit(1);

            if (!record) {
                // Jika belum terdaftar, buat rekaman baru
                const resetAt = new Date(nowMs + windowMs);
                try {
                    await db.insert(rateLimits).values({
                        ip,
                        count: 1,
                        resetAt,
                    });
                } catch {
                    // Proteksi concurrent insertion
                    await db.update(rateLimits)
                        .set({ count: 1, resetAt })
                        .where(eq(rateLimits.ip, ip));
                }
                return;
            }

            const recordResetTime = record.resetAt.getTime();

            if (nowMs > recordResetTime) {
                // Jika sudah melewati jendela reset, set ulang hitungan
                const resetAt = new Date(nowMs + windowMs);
                await db.update(rateLimits)
                    .set({
                        count: 1,
                        resetAt,
                    })
                    .where(eq(rateLimits.ip, ip));
                return;
            }

            const newCount = record.count + 1;

            if (newCount > maxRequests) {
                // Blokir request, tapi tetap update hitungan di DB agar akurat
                await db.update(rateLimits)
                    .set({ count: newCount })
                    .where(eq(rateLimits.ip, ip));

                set.status = 429; // Too Many Requests
                const remainingSeconds = Math.max(1, Math.ceil((recordResetTime - nowMs) / 1000));
                set.headers["Retry-After"] = remainingSeconds.toString();
                return {
                    success: false,
                    message: `Terlalu banyak percobaan! Silakan coba lagi dalam ${remainingSeconds} detik.`
                };
            }

            // Simpan kenaikan hitungan
            await db.update(rateLimits)
                .set({ count: newCount })
                .where(eq(rateLimits.ip, ip));

        } catch (dbError) {
            // Fail-open: Jika koneksi DB bermasalah, tetap izinkan request demi UX pengguna
            console.error("Rate Limiter Database Error (Fail-Open):", dbError);
        }
    };
}
