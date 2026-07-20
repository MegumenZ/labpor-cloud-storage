import { db, files, users } from "./src/db";
import { eq, sql } from "drizzle-orm";

const allUsers = await db.select().from(users);

console.log("=== STORAGE USAGE PER USER IN DB ===");
for (const u of allUsers) {
    const [storageResult] = await db
        .select({
            totalFiles: sql<number>`count(${files.id})::int`,
            usedStorage: sql`coalesce(sum(${files.size}), 0)`,
        })
        .from(files)
        .where(and(eq(files.userId, u.id), eq(files.isDeleted, false))); // normal files
        
    const [deletedResult] = await db
        .select({
            totalFiles: sql<number>`count(${files.id})::int`,
            usedStorage: sql`coalesce(sum(${files.size}), 0)`,
        })
        .from(files)
        .where(and(eq(files.userId, u.id), eq(files.isDeleted, true))); // in trash
        
    const usedStorage = Number(storageResult?.usedStorage || 0);
    const deletedStorage = Number(deletedResult?.usedStorage || 0);
    
    console.log(`User: ${u.username} (${u.displayName})`);
    console.log(`- Normal Files: ${storageResult?.totalFiles} (Size: ${(usedStorage / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`- Trash Files: ${deletedResult?.totalFiles} (Size: ${(deletedStorage / (1024 * 1024)).toFixed(2)} MB)`);
    console.log("---");
}

console.log("\n=== LIST OF ALL FILES IN DB (TOP 20 LARGE) ===");
const dbFiles = await db.select({
    id: files.id,
    name: files.name,
    size: files.size,
    isFolder: files.isFolder,
    isDeleted: files.isDeleted,
    userId: files.userId,
    username: users.username
})
.from(files)
.leftJoin(users, eq(files.userId, users.id))
.orderBy(sql`${files.size} DESC`)
.limit(20);

dbFiles.forEach(f => {
    console.log(`File: ${f.name}`);
    console.log(`- Size: ${(Number(f.size) / (1024 * 1024)).toFixed(2)} MB (${f.size} bytes)`);
    console.log(`- User: ${f.username} (ID: ${f.userId})`);
    console.log(`- isFolder: ${f.isFolder}, isDeleted: ${f.isDeleted}`);
    console.log("---");
});

process.exit(0);

// Helper for conditional statements in top loop
function and(...conditions: any[]) {
    return sql`(${sql.join(conditions, sql` AND `)})`;
}
