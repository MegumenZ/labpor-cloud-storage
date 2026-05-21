import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

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
