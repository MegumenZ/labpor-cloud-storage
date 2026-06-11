import { db, files, userFavorites } from "../db";

async function main() {
  console.log("Memulai pembersihan data tabel 'files' dan 'user_favorites'...");
  try {
    await db.delete(userFavorites);
    await db.delete(files);
    console.log("Pembersihan database selesai! Semua record file lama telah dihapus.");
  } catch (error) {
    console.error("Gagal membersihkan database:", error);
  }
  process.exit(0);
}

main();
