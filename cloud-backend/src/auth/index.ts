import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db, users, files } from "../db";
import { eq, sql } from "drizzle-orm";
import { unlink } from "fs/promises";

export const authRoutes = new Elysia({ prefix: "/auth" })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!
        })
    )
    .post(
        "/register",
        async ({ body, set }) => {
            const { username, password, displayName } = body;

            // Check if user exists
            const existing = await db.select().from(users).where(eq(users.username, username));
            if (existing.length > 0) {
                set.status = 400;
                return { message: "Username already exists" };
            }

            // Create user
            const hashedPassword = await Bun.password.hash(password);
            const [newUser] = await db.insert(users).values({
                username,
                password: hashedPassword,
                displayName,
                avatar: `https://ui-avatars.com/api/?name=${displayName}&background=random`,
            }).returning();

            return {
                success: true,
                data: {
                    id: newUser.id,
                    username: newUser.username,
                    displayName: newUser.displayName,
                    avatar: newUser.avatar
                }
            };
        },
        {
            body: t.Object({
                username: t.String(),
                password: t.String(),
                displayName: t.String(),
            }),
        }
    )
    .post(
        "/login",
        async ({ body, jwt, set }) => {
            const { username, password } = body;

            const [user] = await db.select().from(users).where(eq(users.username, username));

            if (!user) {
                set.status = 401;
                return { message: "Invalid credentials" };
            }

            const isMatch = await Bun.password.verify(password, user.password);
            if (!isMatch) {
                set.status = 401;
                return { message: "Invalid credentials" };
            }

            const token = await jwt.sign({
                id: user.id,
                username: user.username,
            });

            return {
                success: true,
                token: token,
                username: user.username,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatar: user.avatar,
                },
            };
        },
        {
            body: t.Object({
                username: t.String(),
                password: t.String(),
            }),
        }
    )
    .get("/me", async ({ jwt, set, headers }) => {
        const authHeader = headers["authorization"];
        if (!authHeader) {
            set.status = 401;
            return { message: "Unauthorized" };
        }
        const token = authHeader.split(" ")[1];
        const profile = await jwt.verify(token);

        if (!profile) {
            set.status = 401;
            return { message: "Unauthorized" };
        }

        // Fetch full user details
        const [user] = await db.select().from(users).where(eq(users.id, profile.id as string));

        if (!user) {
            set.status = 401;
            return { message: "User not found" };
        }

        // Helper to parse size string to bytes
        const parseSize = (sizeStr: string): number => {
            if (!sizeStr) return 0;
            const str = sizeStr.toString().toUpperCase();
            const num = parseFloat(str);
            if (isNaN(num)) return 0;

            if (str.includes("GB")) return num * 1024 * 1024 * 1024;
            if (str.includes("MB")) return num * 1024 * 1024;
            if (str.includes("KB")) return num * 1024;
            return num; // Assumes bytes if no unit
        };

        // Fetch all files for user to calculate storage in JS
        const userFiles = await db.select({ size: files.size }).from(files).where(eq(files.userId, user.id));

        const totalFiles = userFiles.length;
        const usedStorage = userFiles.reduce((acc, file) => {
            return acc + parseSize(file.size);
        }, 0);

        return {
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                createdAt: user.createdAt,
                totalFiles: totalFiles,
                usedStorage: usedStorage,
                storageLimit: 1024 * 1024 * 1024 * 5, // 5GB
            }
        };
    })
    .get("/profile", async ({ jwt, set, headers, request }) => {
        const authHeader = headers["authorization"];
        if (!authHeader) {
            set.status = 401;
            return { message: "Unauthorized" };
        }
        const token = authHeader.split(" ")[1];
        const profile = await jwt.verify(token);

        if (!profile) {
            set.status = 401;
            return { message: "Unauthorized" };
        }

        // Fetch full user details
        const [user] = await db.select().from(users).where(eq(users.id, profile.id as string));

        if (!user) {
            set.status = 401;
            return { message: "User not found" };
        }

        // Helper to parse size string to bytes
        const parseSize = (sizeStr: string): number => {
            if (!sizeStr) return 0;
            const str = sizeStr.toString().toUpperCase();
            const num = parseFloat(str);
            if (isNaN(num)) return 0;

            if (str.includes("GB")) return num * 1024 * 1024 * 1024;
            if (str.includes("MB")) return num * 1024 * 1024;
            if (str.includes("KB")) return num * 1024;
            return num; // Assumes bytes if no unit
        };

        // Fetch all files for user to calculate storage in JS
        const userFiles = await db.select({ size: files.size }).from(files).where(eq(files.userId, user.id));

        const totalFiles = userFiles.length;
        const usedStorage = userFiles.reduce((acc, file) => {
            return acc + parseSize(file.size);
        }, 0);

        const baseUrl = new URL(request.url).origin;
        const avatar = user.avatar;
        const fullAvatar = avatar && !avatar.startsWith("http")
            ? `${baseUrl}/uploads/avatars/${avatar}`
            : avatar;

        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: fullAvatar,
            createdAt: user.createdAt,
            totalFiles: totalFiles,
            usedStorage: usedStorage,
            storageLimit: 1024 * 1024 * 1024 * 5,
        };
    })
    .put("/profile", async ({ body, jwt, set, headers }) => {
        const authHeader = headers["authorization"];
        if (!authHeader) {
            set.status = 401;
            return { message: "Unauthorized" };
        }
        const token = authHeader.split(" ")[1];
        const profile = await jwt.verify(token);

        if (!profile) {
            set.status = 401;
            return { message: "Unauthorized" };
        }

        const { displayName, avatar } = body as { displayName: string; avatar?: File };

        if (avatar) {
            // 1. Validasi MIME type
            if (!avatar.type.startsWith("image/")) {
                set.status = 400;
                return { message: "Avatar must be an image file" };
            }

            // 2. Validasi ukuran (max 2MB)
            const MAX_SIZE = 2 * 1024 * 1024;
            if (avatar.size > MAX_SIZE) {
                set.status = 400;
                return { message: "Avatar size must be under 2MB" };
            }
        }

        // Get old avatar before updating database
        let oldAvatar: string | null = null;
        if (avatar) {
            const [currentUser] = await db.select({ avatar: users.avatar }).from(users).where(eq(users.id, profile.id as string));
            if (currentUser && currentUser.avatar) {
                oldAvatar = currentUser.avatar;
            }
        }

        const updateData: any = { displayName };

        if (avatar) {
            const extension = avatar.type.split("/")[1];
            const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
            await Bun.write(`uploads/avatars/${fileName}`, avatar);
            updateData.avatar = fileName;

            // Delete old physical avatar file if it was a local file
            if (oldAvatar && !oldAvatar.startsWith("http")) {
                try {
                    await unlink(`uploads/avatars/${oldAvatar}`);
                    console.log(`Deleted old physical avatar: uploads/avatars/${oldAvatar}`);
                } catch (err: any) {
                    console.error(`Failed to delete old physical avatar ${oldAvatar}:`, err.message);
                }
            }
        }

        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, profile.id as string))
            .returning();

        return {
            success: true,
            data: updatedUser
        };
    }, {
        body: t.Object({
            displayName: t.String(),
            avatar: t.Optional(t.File()),
        }),
    });
