import { cron } from "@elysiajs/cron";
import { db, files } from "../db";
import { eq, lt, and, inArray } from "drizzle-orm";
import { getAllDescendants, deletePhysicalFile } from "../utils/ceph";

export const autoDeleteTrash = cron({
    name: "auto-delete-trash",
    pattern: "0 0 * * *", // Jalankan setiap hari pukul 00:00 (tengah malam)
    async run() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        console.log("[Auto Delete Job] Memulai proses pembersihan otomatis tempat sampah...");

        // 1. Ambil berkas/folder root yang ditargetkan untuk dihapus permanen (>30 hari di trash)
        const rootItemsToDelete = await db.select()
            .from(files)
            .where(
                and(
                    eq(files.isDeleted, true),
                    lt(files.deletedAt, thirtyDaysAgo)
                )
            );

        if (rootItemsToDelete.length > 0) {
            const allTargetIds = new Set<string>();
            const physicalFilesToDelete = new Set<string>();

            for (const item of rootItemsToDelete) {
                allTargetIds.add(item.id);
                if (!item.isFolder && item.storagePath) {
                    physicalFilesToDelete.add(item.storagePath);
                }

                // Kumpulkan semua sub-item jika itu adalah folder
                if (item.isFolder) {
                    try {
                        const descendants = await getAllDescendants(item.id);
                        for (const d of descendants) {
                            allTargetIds.add(d.id);
                            if (!d.isFolder && d.storagePath) {
                                physicalFilesToDelete.add(d.storagePath);
                            }
                        }
                    } catch (descError: any) {
                        console.error(`[Auto Delete Job] Gagal mengumpulkan anak folder ${item.id}:`, descError.message);
                    }
                }
            }

            const targetIdsArray = Array.from(allTargetIds);

            if (targetIdsArray.length > 0) {
                let dbDeleteSuccess = false;
                try {
                    // 2. Lakukan penghapusan database dalam satu transaksi (jika memungkinkan) atau update/delete batch
                    await db.transaction(async (tx) => {
                        // Set parentId ke null terlebih dahulu untuk menghindari pelanggaran FK constraint
                        await tx.update(files)
                            .set({ parentId: null })
                            .where(inArray(files.id, targetIdsArray));

                        // Hapus baris dari database
                        await tx.delete(files)
                            .where(inArray(files.id, targetIdsArray));
                    });
                    dbDeleteSuccess = true;
                    console.log(`[Auto Delete Job] Berhasil menghapus ${targetIdsArray.length} baris metadata dari database.`);
                } catch (dbError: any) {
                    console.error(`[Auto Delete Job] Gagal menghapus metadata dari database:`, dbError.message);
                }

                // 3. Hapus berkas fisik dari Ceph S3 hanya jika penghapusan database berhasil
                if (dbDeleteSuccess) {
                    for (const storagePath of physicalFilesToDelete) {
                        try {
                            await deletePhysicalFile(storagePath);
                            console.log(`[Auto Delete Job] Berhasil menghapus objek Ceph S3: ${storagePath}`);
                        } catch (err: any) {
                            console.error(`[Auto Delete Job] Gagal menghapus objek Ceph S3 ${storagePath}:`, err.message);
                        }
                    }
                }
            }
        } else {
            console.log("[Auto Delete Job] Tidak ada berkas/folder lama untuk dihapus.");
        }
    }
});
