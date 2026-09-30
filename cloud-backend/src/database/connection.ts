// src/database/connection.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("CRITICAL: DATABASE_URL environment variable is missing! Server cannot start without database connection credentials.");
}
export const client = postgres(connectionString);
export const db = drizzle(client);
