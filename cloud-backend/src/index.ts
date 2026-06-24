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

// Ensure local uploads directory exists for static assets (e.g. avatars) to avoid ENOENT crashes
await mkdir("uploads/avatars", { recursive: true });

const app = new Elysia({
    serve: {
        maxRequestBodySize: 1024 * 1024 * 1024 * 50 // 50GB in bytes
    }
})
    .use(cors({
        origin: process.env.ALLOWED_ORIGINS || "http://localhost:5173",
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
        if (url.pathname.startsWith("/swagger") || url.pathname === "/" || url.pathname.startsWith("/uploads")) return;

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
    .get("/uploads/avatars/*", async ({ params, set }) => {
        const path = params["*"];
        const cleanPath = path.includes("avatars/") ? path : `avatars/${path}`;
        
        if (cleanPath.includes("..") || cleanPath.includes("\\")) {
            set.status = 400;
            return { message: "Invalid filename" };
        }

        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: cleanPath,
            });
            const response = await s3.send(command);
            if (!response.Body) {
                set.status = 404;
                return { message: "Avatar not found" };
            }
            set.headers["content-type"] = response.ContentType || "image/jpeg";
            const bytes = await response.Body.transformToByteArray();
            return new Response(bytes);
        } catch (err: any) {
            set.status = 404;
            return { message: "Avatar not found" };
        }
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
        
        if (code === "VALIDATION") {
            await writeLog("WARN", "SYSTEM", `Validation failure: ${error.message}`, {
                ip,
                metadata: {
                    errors: (error as any).all
                }
            });
            set.status = 400;
            return { message: error.message, errors: (error as any).all };
        }
        
        if (error instanceof AuthenticationError) {
            await writeLog("WARN", "AUTH", `Authentication failed: ${error.message}`, { ip });
            set.status = 401;
            return { message: error.message };
        }

        // Log unhandled server errors as ERROR level
        await writeLog("ERROR", "ERROR", `Unhandled server error: ${error.message}`, {
            ip,
            errorStack: error.stack
        });

        if (code === "NOT_FOUND") {
            set.status = 404;
            return { message: "Not Found" };
        }

        set.status = 500;
        return { message: "Internal Server Error" };
    })
    .get("/", () => "Hello Elysia")
    .listen(process.env.PORT ? parseInt(process.env.PORT) : 3001);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
