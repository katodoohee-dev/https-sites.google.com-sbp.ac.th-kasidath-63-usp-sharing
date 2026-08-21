import { Router } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const galleryRouter = Router();
const UPLOAD_DIR = path.resolve("data/uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const uploadSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().min(3),
  fileName: z.string().max(180).optional(),
  filename: z.string().max(180).optional(),
});
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
const MAX_BYTES = 50 * 1024 * 1024;

function saveUpload(req: any, body: unknown) {
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "invalid body"), { status: 400 });
  const { imageBase64, mimeType } = parsed.data;
  const requestedName = parsed.data.fileName ?? parsed.data.filename;
  if (!EXT_BY_MIME[mimeType]) throw Object.assign(new Error("unsupported media type"), { status: 415 });
  const raw = imageBase64.includes(",") ? imageBase64.split(",", 2)[1]! : imageBase64;
  let buffer: Buffer;
  try { buffer = Buffer.from(raw, "base64"); } catch { throw Object.assign(new Error("invalid base64"), { status: 400 }); }
  if (!buffer.length || buffer.length > MAX_BYTES) throw Object.assign(new Error("media file must be between 1 byte and 50MB"), { status: 413 });
  const id = `m_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  const ext = EXT_BY_MIME[mimeType];
  const safeName = (requestedName ?? `${id}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${req.userId}_${id}_${safeName}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  const url = `/uploads/${filename}`;
  db.prepare(`INSERT INTO media_assets (id,user_id,file_name,mime_type,url,size_bytes) VALUES (?,?,?,?,?,?)`).run(id, req.userId, requestedName ?? safeName, mimeType, url, buffer.length);
  return { id, url, fileName: requestedName ?? safeName, mimeType, sizeBytes: buffer.length, createdAt: new Date().toISOString() };
}

function handleUpload(req: any, res: any) {
  try { return res.status(201).json({ success: true, media: saveUpload(req, req.body) }); }
  catch (e: any) { return res.status(e?.status ?? 500).json({ success: false, error: e?.message ?? "upload_failed" }); }
}

galleryRouter.post("/", handleUpload);
galleryRouter.post("/upload", handleUpload);

galleryRouter.get("/", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const rows = db.prepare(`SELECT id,file_name AS fileName,mime_type AS mimeType,url,size_bytes AS sizeBytes,created_at AS createdAt FROM media_assets WHERE user_id=? ORDER BY created_at DESC LIMIT ?`).all(req.userId, limit);
  res.json({ success: true, items: rows });
});

galleryRouter.get("/:id", (req, res) => {
  const row = db.prepare(`SELECT id,file_name AS fileName,mime_type AS mimeType,url,size_bytes AS sizeBytes,created_at AS createdAt FROM media_assets WHERE id=? AND user_id=?`).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, error: "not_found" });
  res.json({ success: true, media: row, item: row });
});

galleryRouter.delete("/:id", (req, res) => {
  const row = db.prepare(`SELECT url FROM media_assets WHERE id=? AND user_id=?`).get(req.params.id, req.userId) as {url?:string}|undefined;
  if (!row) return res.status(404).json({ success:false, error:"not_found" });
  if (row.url?.startsWith("/uploads/")) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(row.url))); } catch {}
  }
  db.prepare(`DELETE FROM media_assets WHERE id=? AND user_id=?`).run(req.params.id, req.userId);
  res.json({ success:true });
});
