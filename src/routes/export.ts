import { Router } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const exportRouter = Router();

const EXPORT_DIR = path.join("data", "exports");
fs.mkdirSync(EXPORT_DIR, { recursive: true });

const requestSchema = z.object({
  format: z.enum(["pdf", "csv"]),
  range: z.enum(["7d", "30d", "90d", "all"]),
});

function rangeToSql(range: "7d" | "30d" | "90d" | "all"): string {
  switch (range) {
    case "7d":
      return "AND created_at >= datetime('now', '-7 days')";
    case "30d":
      return "AND created_at >= datetime('now', '-30 days')";
    case "90d":
      return "AND created_at >= datetime('now', '-90 days')";
    case "all":
      return "";
  }
}

interface FoodRow {
  id: number;
  meal_type: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
}

function fetchEntries(userId: string, range: "7d" | "30d" | "90d" | "all"): FoodRow[] {
  return db
    .prepare(
      `SELECT id, meal_type, food_name, calories, protein, carbs, fat, created_at
       FROM food_entries WHERE user_id = ? ${rangeToSql(range)} ORDER BY created_at DESC`
    )
    .all(userId) as FoodRow[];
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: FoodRow[]): string {
  const header = ["วันที่", "มื้อ", "รายการอาหาร", "แคลอรี", "โปรตีน(g)", "คาร์บ(g)", "ไขมัน(g)"];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [r.created_at, r.meal_type, r.food_name, r.calories, r.protein, r.carbs, r.fat].map(csvEscape).join(",")
    );
  }
  // BOM เพื่อให้ Excel เปิดภาษาไทยไม่เพี้ยน
  return "\uFEFF" + lines.join("\r\n");
}

/**
 * สร้าง PDF แบบ minimal-but-valid ด้วยมือ (ไม่พึ่ง library ภายนอก)
 * รองรับเฉพาะข้อความ ASCII ใน PDF content stream ตามข้อจำกัดของ base-14 font (Helvetica)
 * จึงสรุปเป็นภาษาอังกฤษ + ตัวเลข เพื่อให้ไฟล์เปิดได้แน่นอนในทุก PDF reader
 */
function buildPdf(rows: FoodRow[], range: string): Buffer {
  const totalCalories = rows.reduce((sum, r) => sum + r.calories, 0);
  const lines: string[] = [
    `WK Health App - Nutrition Export`,
    `Range: ${range}`,
    `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    `Total entries: ${rows.length}`,
    `Total calories: ${totalCalories}`,
    ``,
  ];
  for (const r of rows.slice(0, 40)) {
    const name = r.food_name.replace(/[^\x20-\x7E]/g, "?"); // non-ASCII -> ? (ข้อจำกัดของ Helvetica base font)
    lines.push(`${r.created_at.slice(0, 16)}  ${r.meal_type.padEnd(10)}  ${name.slice(0, 30).padEnd(30)}  ${r.calories} kcal`);
  }
  if (rows.length > 40) lines.push(`... and ${rows.length - 40} more entries (see CSV export for full data)`);

  const escapePdfText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const contentLines = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 16 : 10} Tf 40 ${780 - i * 16} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const contentStream = contentLines;
  objects.push(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

/** POST /api/export — สร้างไฟล์ export จริง (PDF/CSV) จากข้อมูลอาหารของผู้ใช้ */
exportRouter.post("/", (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "invalid_params", details: parsed.error.flatten() });
  }
  const { format, range } = parsed.data;

  const rows = fetchEntries(req.userId, range);
  const id = crypto.randomUUID();
  const ext = format === "pdf" ? "pdf" : "csv";
  const filename = `${req.userId}_${id}.${ext}`;
  const filePath = path.join(EXPORT_DIR, filename);

  const fileBuffer = format === "csv" ? Buffer.from(buildCsv(rows), "utf-8") : buildPdf(rows, range);
  fs.writeFileSync(filePath, fileBuffer);

  db.prepare(
    `INSERT INTO export_history (id, user_id, format, range, file_path) VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.userId, format, range, filename);

  res.json({ success: true, downloadUrl: `/exports/${filename}` });
});

/** GET /api/export/history — ประวัติการ export ล่าสุดของผู้ใช้ (คืนเป็น array ตรงตาม type ที่ frontend คาดหวัง) */
exportRouter.get("/history", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, format, range, created_at AS createdAt FROM export_history
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(req.userId);
  res.json(rows);
});
