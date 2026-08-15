import { Router } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const galleryRouter = Router();

const UPLOAD_DIR = path.resolve("data/uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * POST /api/gallery/upload — รับรูป base64 เก็บลง disk จริง คืน URL ให้ frontend เอาไปใส่ photoUrl ตอน /api/scan/save
 * (ของเดิมเก็บรูปไว้ใน IndexedDB ฝั่ง client ล้วนๆ อันนี้ย้ายมาเก็บฝั่ง server แทนเพื่อดูย้อนหลังได้ทุกอุปกรณ์)
 */
const uploadSchema = z.object({
  imageBase64: z.string().min(100),
  mimeType: z.string().default("image/jpeg"),
});

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

galleryRouter.post("/upload", (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { imageBase64, mimeType } = parsed.data;
  const ext = EXT_BY_MIME[mimeType] ?? "jpg";

  let buffer: Buffer;
  try {
    const raw = imageBase64.includes(",") ? imageBase64.split(",")[1]! : imageBase64;
    buffer = Buffer.from(raw, "base64");
  } catch {
    return res.status(400).json({ success: false, error: "รูปภาพ base64 ไม่ถูกต้อง" });
  }
  if (buffer.length > 10 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: "ไฟล์รูปใหญ่เกิน 10MB" });
  }

  const filename = `${req.userId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  res.status(201).json({ success: true, url: `/uploads/${filename}` });
});

/** GET /api/gallery?limit=30 — ไทม์ไลน์รูปอาหารย้อนหลัง (เทียบ renderGallery เดิม) */
galleryRouter.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const rows = db
    .prepare(
      `SELECT id, food_name, calories, photo_url, created_at FROM food_entries
       WHERE user_id = ? AND photo_url IS NOT NULL AND photo_url != ''
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(req.userId, limit);
  res.json({ success: true, items: rows });
});
