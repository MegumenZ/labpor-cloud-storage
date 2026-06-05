import { db, files, users } from "../db";
import { s3, BUCKET_NAME } from "../files/s3";
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

console.log("=== STARTING CEPH S3 ORPHANED FILES CLEANUP ===");

// 1. Fetch all active file paths from DB
const dbFiles = await db.select({ storagePath: files.storagePath }).from(files);
const activeFilePaths = new Set(dbFiles.map(f => f.storagePath).filter((p): p is string => !!p));

console.log(`Loaded ${activeFilePaths.size} active file paths from 'files' table.`);

// 2. Fetch all active avatar paths from DB
const dbUsers = await db.select({ avatar: users.avatar }).from(users);
const activeAvatars = new Set(dbUsers.map(u => u.avatar).filter((a): a is string => !!a));

console.log(`Loaded ${activeAvatars.size} active avatar paths from 'users' table.`);

// 3. List all objects in the Ceph S3 Bucket
let continuationToken: string | undefined = undefined;
let totalChecked = 0;
let totalDeleted = 0;
let totalBytesReclaimed = 0;

do {
    const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken
    });

    const listResult = await s3.send(listCommand);
    const objects = listResult.Contents || [];

    for (const obj of objects) {
        const key = obj.Key;
        const size = obj.Size || 0;
        if (!key) continue;

        totalChecked++;

        let isOrphaned = false;

        if (key.startsWith("avatars/")) {
            // Check if it exists in users table
            if (!activeAvatars.has(key)) {
                isOrphaned = true;
            }
        } else {
            // Check if it exists in files table
            if (!activeFilePaths.has(key)) {
                isOrphaned = true;
            }
        }

        if (isOrphaned) {
            console.log(`Orphaned object found: ${key} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key
                }));
                console.log(`-> Successfully deleted from S3.`);
                totalDeleted++;
                totalBytesReclaimed += size;
            } catch (err: any) {
                console.error(`-> Failed to delete: ${err.message}`);
            }
        }
    }

    continuationToken = listResult.NextContinuationToken;
} while (continuationToken);

console.log("\n=== CLEANUP COMPLETED ===");
console.log(`Total objects checked: ${totalChecked}`);
console.log(`Total orphaned objects deleted: ${totalDeleted}`);
console.log(`Total storage space reclaimed: ${(totalBytesReclaimed / (1024 * 1024)).toFixed(2)} MB (${totalBytesReclaimed} bytes)`);

process.exit(0);
