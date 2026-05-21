import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL || "postgres://postgres:123456789@localhost:5432/skripsi_cloud",
    },
});
