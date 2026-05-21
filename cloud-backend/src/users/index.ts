import { Elysia } from "elysia";
import { db, users } from "../db";
import { authPlugin, requireAuth } from "../auth/middleware";

export const usersRoutes = new Elysia({ prefix: "/users" })
    .use(authPlugin)
    .get("/", async (c) => {
        await requireAuth(c);
        
        return await db.select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatar: users.avatar,
            createdAt: users.createdAt
        }).from(users);
    });
