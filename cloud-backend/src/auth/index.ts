import { Elysia, t } from "elysia";
import { db, users, files } from "../db";
import { eq, sql, and } from "drizzle-orm";
import { authPlugin, requireAuth, createRateLimiter } from "./middleware";
import { s3, BUCKET_NAME } from "../files/s3";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { writeLog } from "../utils/logger";
import { getAvatarUrl, getCephCapacity, checkStorageOnline } from "../utils/ceph";

export const authRoutes = new Elysia({ prefix: "/auth" })
    .use(authPlugin)
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

            if (password.length < 8) {
                set.status = 400;
                return { message: "Password must be at least 8 characters long" };
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
                    avatar: newUser.avatar,
                    themePreference: newUser.themePreference
                }
            };
        },
        {
            beforeHandle: createRateLimiter(5, 60 * 1000), // Maksimal 5 registrasi per menit per IP
            body: t.Object({
                username: t.String(),
                password: t.String(),
                displayName: t.String(),
            }),
        }
    )
    .post(
        "/login",
        async ({ body, jwtPlugin, set, cookie, request }) => {
            const { username, password } = body;
            const rawIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
            const ip = rawIp.split(",")[0].trim();

            const [user] = await db.select().from(users).where(eq(users.username, username));

            if (!user) {
                await writeLog("WARN", "AUTH", `Login failed: user not found: ${username}`, { ip });
                set.status = 401;
                return { message: "Invalid credentials" };
            }

            const isMatch = await Bun.password.verify(password, user.password);
            if (!isMatch) {
                await writeLog("WARN", "AUTH", `Login failed: incorrect password for user: ${username}`, { ip, userId: user.id });
                set.status = 401;
                return { message: "Invalid credentials" };
            }

            const token = await jwtPlugin.sign({
                id: user.id,
                username: user.username,
            });

            // Set secure HttpOnly session cookie
            cookie.token.set({
                value: token,
                httpOnly: true,
                path: "/",
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
            });

            await writeLog("INFO", "AUTH", `Successful login for user: ${username}`, {
                userId: user.id,
                ip
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
                    themePreference: user.themePreference
                },
            };
        },
        {
            beforeHandle: createRateLimiter(5, 60 * 1000), // Maksimal 5 login per menit per IP
            body: t.Object({
                username: t.String(),
                password: t.String(),
            }),
        }
    )
    .post("/logout", async ({ cookie }) => {
        cookie.token.remove();
        return { success: true, message: "Logged out successfully" };
    })
    .get("/me", async (c) => {
        const profile = await requireAuth(c);
        const { set } = c;

        // Fetch full user details
        const [user] = await db.select().from(users).where(eq(users.id, profile.id));

        if (!user) {
            set.status = 401;
            return { message: "User not found" };
        }

        // High Performance Database-level Aggregation (Total files uploaded by this user)
        const [userFilesResult] = await db
            .select({
                totalFiles: sql<number>`count(${files.id})::int`,
            })
            .from(files)
            .where(and(eq(files.userId, user.id), eq(files.isDeleted, false)));

        // Total storage used collectively by all non-deleted files in the system
        const [systemStorageResult] = await db
            .select({
                usedStorage: sql`coalesce(sum(${files.size}), 0)`,
            })
            .from(files)
            .where(eq(files.isDeleted, false));

        const totalFiles = userFilesResult?.totalFiles || 0;
        const usedStorage = Number(systemStorageResult?.usedStorage || 0);

        return {
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: await getAvatarUrl(user.avatar),
                createdAt: user.createdAt,
                totalFiles: totalFiles,
                usedStorage: usedStorage,
                storageLimit: await getCephCapacity(),
                storageOnline: await checkStorageOnline(),
                themePreference: user.themePreference,
            }
        };
    })
    .get("/profile", async (c) => {
        const profile = await requireAuth(c);
        const { set, request } = c;

        // Fetch full user details
        const [user] = await db.select().from(users).where(eq(users.id, profile.id));

        if (!user) {
            set.status = 401;
            return { message: "User not found" };
        }

        // High Performance Database-level Aggregation (Total files uploaded by this user)
        const [userFilesResult] = await db
            .select({
                totalFiles: sql<number>`count(${files.id})::int`,
            })
            .from(files)
            .where(and(eq(files.userId, user.id), eq(files.isDeleted, false)));

        // Total storage used collectively by all non-deleted files in the system
        const [systemStorageResult] = await db
            .select({
                usedStorage: sql`coalesce(sum(${files.size}), 0)`,
            })
            .from(files)
            .where(eq(files.isDeleted, false));

        const totalFiles = userFilesResult?.totalFiles || 0;
        const usedStorage = Number(systemStorageResult?.usedStorage || 0);

        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: await getAvatarUrl(user.avatar),
            createdAt: user.createdAt,
            totalFiles: totalFiles,
            usedStorage: usedStorage,
            storageLimit: await getCephCapacity(),
            storageOnline: await checkStorageOnline(),
            themePreference: user.themePreference,
        };
    })
    .put("/profile", async (c) => {
        const profile = await requireAuth(c);
        const { body, set } = c;

        const { displayName, avatar } = body as { displayName: string; avatar?: File };

        if (avatar) {
            // 1. Validasi MIME type
            if (!avatar.type.startsWith("image/")) {
                set.status = 400;
                return { message: "Avatar must be an image file" };
            }

            // 2. Validasi ukuran (max 10MB)
            const MAX_SIZE = 10 * 1024 * 1024;
            if (avatar.size > MAX_SIZE) {
                set.status = 400;
                return { message: "Avatar size must be under 10MB" };
            }
        }

        // Get old avatar before updating database
        let oldAvatar: string | null = null;
        if (avatar) {
            const [currentUser] = await db.select({ avatar: users.avatar }).from(users).where(eq(users.id, profile.id));
            if (currentUser && currentUser.avatar) {
                oldAvatar = currentUser.avatar;
            }
        }

        const updateData: any = { displayName };

        if (avatar) {
            const extension = avatar.type.split("/")[1];
            const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const storagePath = `avatars/${safeFileName}`;

            try {
                const uploadStart = Date.now();
                const arrayBuffer = await avatar.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                await s3.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: storagePath,
                    Body: buffer,
                    ContentType: avatar.type,
                }));
                
                const uploadDuration = Date.now() - uploadStart;
                await writeLog("INFO", "CEPH", `Successfully uploaded user avatar to Ceph S3: ${storagePath}`, {
                    userId: profile.id,
                    elapsedMs: uploadDuration,
                    metadata: {
                        bucket: BUCKET_NAME,
                        key: storagePath,
                        fileSize: avatar.size,
                        contentType: avatar.type
                    }
                });
                updateData.avatar = storagePath;
            } catch (err: any) {
                await writeLog("ERROR", "CEPH", `Failed to upload user avatar to Ceph S3 ${storagePath}: ${err.message}`, {
                    userId: profile.id,
                    errorStack: err.stack
                });
                set.status = 500;
                return { message: "Failed to save profile picture to cloud storage" };
            }

            // Delete old avatar object from Ceph S3
            if (oldAvatar && !oldAvatar.startsWith("http")) {
                try {
                    const deleteStart = Date.now();
                    await s3.send(new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: oldAvatar
                    }));
                    const deleteDuration = Date.now() - deleteStart;
                    await writeLog("INFO", "CEPH", `Deleted old user avatar from Ceph S3: ${oldAvatar}`, {
                        userId: profile.id,
                        elapsedMs: deleteDuration,
                        metadata: {
                            bucket: BUCKET_NAME,
                            key: oldAvatar
                        }
                    });
                } catch (err: any) {
                    await writeLog("WARN", "CEPH", `Failed to delete old user avatar from Ceph S3 ${oldAvatar}: ${err.message}`, {
                        userId: profile.id,
                        errorStack: err.stack
                    });
                }
            }
        }

        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, profile.id))
            .returning({
                id: users.id,
                username: users.username,
                displayName: users.displayName,
                avatar: users.avatar,
                themePreference: users.themePreference
            });

        const returnedUser = {
            ...updatedUser,
            avatar: await getAvatarUrl(updatedUser.avatar)
        };

        return {
            success: true,
            data: returnedUser
        };
    }, {
        body: t.Object({
            displayName: t.String(),
            avatar: t.Optional(t.File()),
        }),
    })
    .put(
        "/theme",
        async (c) => {
            const profile = await requireAuth(c);
            const { body, set } = c;
            const { theme } = body;

            if (theme !== "light" && theme !== "dark") {
                set.status = 400;
                return { message: "Tema tidak valid" };
            }

            const [updatedUser] = await db.update(users)
                .set({ themePreference: theme })
                .where(eq(users.id, profile.id))
                .returning();

            return {
                success: true,
                theme: updatedUser.themePreference
            };
        },
        {
            body: t.Object({
                theme: t.String(),
            }),
        }
    )
