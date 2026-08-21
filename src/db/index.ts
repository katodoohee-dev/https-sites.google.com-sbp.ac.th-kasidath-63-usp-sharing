import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || "./data/wk-health.sqlite";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);
db.exec(`
CREATE TABLE IF NOT EXISTS media_assets (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 url TEXT NOT NULL,
 size_bytes INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_assets_user ON media_assets(user_id, created_at);
CREATE TABLE IF NOT EXISTS connected_devices (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_name TEXT,
 device_type TEXT NOT NULL DEFAULT 'bluetooth',
 device_uid TEXT,
 status TEXT NOT NULL DEFAULT 'connected',
 metadata_json TEXT,
 last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_connected_devices_user ON connected_devices(user_id, last_seen_at);
CREATE TABLE IF NOT EXISTS sound_sessions (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 volume INTEGER NOT NULL DEFAULT 68,
 mode TEXT NOT NULL DEFAULT 'Ambient',
 voice_enabled INTEGER NOT NULL DEFAULT 1,
 output_device TEXT,
 input_device TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
