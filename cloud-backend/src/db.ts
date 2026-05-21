// src/db.ts
import { drizzle } from "drizzle-orm/postgres-js";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"; // Tambah import
import { relations } from "drizzle-orm"; // Tambah import relations
import postgres from "postgres";

// --- KONEKSI DATABASE ---
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("CRITICAL: DATABASE_URL environment variable is missing! Server cannot start without database connection credentials.");
}
const client = postgres(connectionString);
export const db = drizzle(client);

// --- 1. TABEL USERS ---
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  displayName: text("display_name"),
  avatar: text("avatar"),
});

// --- 2. TABEL FILES (METADATA) ---
export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Relasi: File ini punya siapa?
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),

  // Relasi: File ini ada di folder mana? (Bisa null kalau di root/halaman utama)
  parentId: uuid("parent_id").references((): AnyPgColumn => files.id),

  name: text("name").notNull(),
  type: text("type").notNull(), // 'folder', 'image/png', 'application/pdf', dll
  size: bigint("size", { mode: "number" }).notNull(),

  // Path virtual (Nanti dipakai buat S3 Key di Ceph)
  storagePath: text("storage_path"),

  isFolder: boolean("is_folder").default(false),
  createdAt: timestamp("created_at").defaultNow(),

  // Soft Delete
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),

  // Favorites
  isFavorite: boolean("is_favorite").default(false),
});

// --- 3. DEFINISI RELASI (Agar Drizzle pintar saat query) ---

// Satu User punya BANYAK File
export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
}));

// Satu File punya SATU User & SATU Parent Folder
export const filesRelations = relations(files, ({ one, many }) => ({
  owner: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  parent: one(files, {
    fields: [files.parentId],
    references: [files.id],
    relationName: "parent_child", // Nama relasi folder bapak-anak
  }),
  children: many(files, {
    relationName: "parent_child",
  }),
}));
