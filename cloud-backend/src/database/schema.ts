// src/database/schema.ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  bigint,
  index,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// --- 1. TABEL USERS ---
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  displayName: text("display_name"),
  avatar: text("avatar"),
  themePreference: text("theme_preference").default("light").notNull(),
});

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
  deletedBy: uuid("deleted_by").references(() => users.id),

  // Favorites (deprecating but keeping for schema compatibility)
  isFavorite: boolean("is_favorite").default(false),

  // Collaborative lock status
  allowEdit: boolean("allow_edit").default(true).notNull(),
}, (table) => {
  return {
    userIdIdx: index("user_id_idx").on(table.userId),
    parentIdIdx: index("parent_id_idx").on(table.parentId),
    userIdIsDeletedIdx: index("user_id_is_deleted_idx").on(table.userId, table.isDeleted),
    userIdIsFavoriteIdx: index("user_id_is_favorite_idx").on(table.userId, table.isFavorite),
    folderListingIdx: index("folder_listing_idx").on(table.userId, table.parentId, table.isDeleted, table.createdAt),
    activeStorageIdx: index("active_storage_idx").on(table.size).where(sql`${table.isDeleted} = false`),
  };
});

// --- 2. TABEL USER FAVORITES (Favorit Personal per-User) ---
export const userFavorites = pgTable("user_favorites", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  fileId: uuid("file_id")
    .references(() => files.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    userFileIdx: index("user_file_idx").on(table.userId, table.fileId),
    userFileUnique: unique("user_file_unique").on(table.userId, table.fileId),
  };
});

// --- 3. RESERVASI KUOTA UPLOAD (Mencegah Oversubscription) ---
export const uploadReservations = pgTable("upload_reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  storagePath: text("storage_path").notNull().unique(),
  reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  expiresAtIdx: index("upload_reservations_expires_at_idx").on(table.expiresAt),
}));

// --- 4. TABEL RATE LIMITS (Persisten & Bebas Biaya) ---
export const rateLimits = pgTable("rate_limits", {
  ip: text("ip").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at").notNull(),
});

// --- 4. DEFINISI RELASI (Agar Drizzle pintar saat query) ---

// Satu User punya BANYAK File & BANYAK Favorite
export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
  favorites: many(userFavorites),
}));

// Satu File punya SATU User, SATU Parent Folder, dan BANYAK Favorite
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
  favorites: many(userFavorites),
}));

// Hubungan jembatan Favorite menghubungkan User dan File
export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userFavorites.userId],
    references: [users.id],
  }),
  file: one(files, {
    fields: [userFavorites.fileId],
    references: [files.id],
  }),
}));
