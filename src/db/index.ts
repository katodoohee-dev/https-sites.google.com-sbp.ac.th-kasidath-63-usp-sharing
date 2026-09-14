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

// FIX: เพิ่มใหม่ — schema.sql ใช้ "CREATE TABLE IF NOT EXISTS" ซึ่งจะไม่เพิ่มคอลัมน์ใหม่ให้ตารางที่
// มีอยู่แล้วจากรอบก่อน (SQLite ไม่รองรับ "ALTER TABLE ... ADD COLUMN IF NOT EXISTS") ต้องเรียก
// ALTER TABLE แบบ guard เองตรงนี้ ครอบ try/catch เผื่อรันซ้ำแล้วคอลัมน์มีอยู่แล้ว (duplicate column)
function safeAddColumn(table: string, columnDef: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err: any) {
    if (!String(err?.message ?? "").includes("duplicate column name")) throw err;
  }
}
safeAddColumn("users", "avatar TEXT"); // รูปโปรไฟล์ (emoji หรือ data URL รูปที่อัปโหลด)
safeAddColumn("friendships", "nickname TEXT"); // ชื่อเล่นที่ตั้งให้เพื่อนแต่ละคน (เห็นเฉพาะฝั่งตัวเอง)
