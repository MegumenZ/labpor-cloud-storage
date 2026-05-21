import { Elysia } from "elysia";
import { db, users } from "../db";
import { eq } from "drizzle-orm";

export const usersRoutes = new Elysia({ prefix: "/users" })
    .get("/", async () => {
        return await db.select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatar: users.avatar,
            createdAt: users.createdAt
        }).from(users);
    });
