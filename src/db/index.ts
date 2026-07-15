import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

declare global {
  var __sqlite: Database.Database | undefined;
}

function createConnection(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      nickname TEXT,
      status TEXT NOT NULL DEFAULT 'analyzing',
      inputs TEXT NOT NULL,
      profile TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      profile TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lookups (
      address TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `);
  return conn;
}

// Reuse the connection across Next.js dev-mode module reloads.
const conn = globalThis.__sqlite ?? createConnection();
globalThis.__sqlite = conn;

export const db = drizzle(conn, { schema });
export * from "./schema";
