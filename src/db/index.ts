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
