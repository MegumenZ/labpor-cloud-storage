import { db, files, users } from "./src/db";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Checking files in database...");
    const allFiles = await db.select({
        id: files.id,
        name: files.name,
        size: files.size,
        userId: files.userId,
    }).from(files);

    console.log(`Found ${allFiles.length} files.`);
    for (const f of allFiles) {
        console.log(`File: ${f.name}, Size (DB value): '${f.size}', Parsed Int: ${parseInt(f.size)}`);
    }
}

main();
