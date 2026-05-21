import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db, users } from "../db";
import { eq } from "drizzle-orm";

export const usersRoutes = new Elysia({ prefix: "/users" })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
        })
    )
    .get("/", async ({ jwt, headers, cookie, set }) => {
        let token = cookie.token?.value;
        if (!token) {
            const authHeader = headers["authorization"];
            if (authHeader) token = authHeader.split(" ")[1];
        }

        if (!token) {
            set.status = 401;
            return { message: "Unauthorized" };
        }
        
        const profile = await jwt.verify(token);
        if (!profile) {
            set.status = 401;
            return { message: "Unauthorized" };
        }

        return await db.select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatar: users.avatar,
            createdAt: users.createdAt
        }).from(users);
    });
