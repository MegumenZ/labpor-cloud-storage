import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { authRoutes } from "./auth";
import { filesRoutes } from "./files";
import { usersRoutes } from "./users";
import { AuthenticationError, authPlugin } from "./auth/middleware";
import { writeLog } from "./utils/logger";
import { mkdir } from "fs/promises";
import { autoDeleteTrash } from "./cron/autoDeleteTrash";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, BUCKET_NAME } from "./files/s3";

import { normalize, join } from "path";

// Ensure local uploads directory exists for static assets (e.g. avatars) to avoid ENOENT crashes
await mkdir("uploads/avatars", { recursive: true });

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "https://100.83.191.96,http://localhost:5173")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

const app = new Elysia({
    serve: {
        maxRequestBodySize: 1024 * 1024 * 1024 * 500 // 500GB matching Bab III specification
    }
})
    .use(cors({
        origin: (request) => {
            const origin = request.headers.get("origin");
            if (!origin) return true; // Allow non-browser requests (cURL/Postman)
            
            // Check explicit whitelist
            if (allowedOrigins.includes(origin)) return true;
            
            // Check private LAN subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost)
            if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                return true;
            }
            
            return false;
        },
        credentials: true,
    }))
    .use(authPlugin)
    .derive((c) => {
        return {
            startTime: Date.now()
        };
    })
    .onAfterResponse(async ({ request, set, startTime }) => {
        const elapsed = Date.now() - startTime;
        const url = new URL(request.url);
        
        // Skip log untuk swagger, root hello, atau static uploads jika dirasa terlalu berisik
        if (url.pathname.startsWith("/swagger") || url.pathname === "/" || url.pathname.startsWith("/uploads") || url.pathname === "/health") return;

        const rawIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const ip = rawIp.split(",")[0].trim();
        const userAgent = request.headers.get("user-agent") || undefined;

        await writeLog("INFO", "HTTP", `HTTP Request: ${request.method} ${url.pathname}`, {
            ip,
            elapsedMs: elapsed,
            metadata: {
                method: request.method,
                path: url.pathname,
                status: set.status,
                userAgent
            }
        });
    })
    .use(swagger())
    .get("/health", () => {
        return {
            status: "HEALTH_OK",
            timestamp: new Date().toISOString(),
            service: "cloud-backend",
            version: "1.0.0"
        };
    })
    .get("/uploads/avatars/*", async ({ params, set }) => {
        const rawPath = params["*"];
        const relativePath = rawPath.replace(/^avatars\//, "");
        const safePath = normalize(join("avatars", relativePath)).replace(/\\/g, "/");

        if (!safePath.startsWith("avatars/") || safePath.includes("..")) {
            set.status = 400;
            return { message: "Invalid filename" };
        }

        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: safePath,
            });
            const response = await s3.send(command);
            if (response.Body) {
                set.headers["content-type"] = response.ContentType || "image/jpeg";
                const bytes = await response.Body.transformToByteArray();
                return new Response(bytes as unknown as BodyInit);
            }
        } catch (err: any) {}

        try {
            const localFile = Bun.file(`uploads/${safePath}`);
            if (await localFile.exists()) {
                return new Response(localFile);
            }
        } catch (err: any) {}

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>`;
        set.headers["content-type"] = "image/svg+xml";
        return new Response(svg);
    })
    .use(staticPlugin({
        assets: "uploads",
        prefix: "/uploads"
    }))
    .use(autoDeleteTrash)
    .use(authRoutes)
    .use(filesRoutes)
    .use(usersRoutes)
    .onError(async ({ error, set, code, request }) => {
        const rawIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const ip = rawIp.split(",")[0].trim();
        const errorMsg = (error as any)?.message || String(error);

        if (code === "NOT_FOUND") {
            await writeLog("INFO", "HTTP", `Resource not found: ${request.url}`, { ip });
            set.status = 404;
            return { message: "Not Found" };
        }
        
        if (code === "VALIDATION") {
            await writeLog("WARN", "SYSTEM", `Validation failure: ${errorMsg}`, {
                ip,
                metadata: {
                    errors: (error as any).all
                }
            });
            set.status = 400;
            return { message: errorMsg, errors: (error as any).all };
        }
        
        if (error?.name === "AuthenticationError" || error instanceof AuthenticationError) {
            await writeLog("WARN", "AUTH", `Authentication failed: ${errorMsg}`, { ip });
            set.status = 401;
            return { message: errorMsg };
        }

        // Log unhandled server errors as ERROR level
        await writeLog("ERROR", "ERROR", `Unhandled server error: ${errorMsg}`, {
            ip,
            errorStack: (error as any)?.stack
        });

        set.status = 500;
        return { message: "Internal Server Error" };
    })
    .get("/", () => "Hello Elysia")
    .listen(process.env.PORT ? parseInt(process.env.PORT) : 3001);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
