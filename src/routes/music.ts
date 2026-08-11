import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const musicRouter = Router();

const addTrackSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  type: z.enum(["youtube", "audio"]),
  ytId: z.string().optional(),
});

/** GET /api/music/library — playlist ของผู้ใช้ */
musicRouter.get("/library", (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM music_library WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.userId);
  res.json({ success: true, tracks: rows });
});

/** POST /api/music/library — เพิ่มเพลง (เทียบ processStickerUpload/library add เดิม) */
musicRouter.post("/library", (req, res) => {
  const parsed = addTrackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const id = "t_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex");
  db.prepare(
    `INSERT INTO music_library (id, user_id, url, title, type, yt_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.userId, d.url, d.title ?? null, d.type, d.ytId ?? null);
  res.status(201).json({ success: true, id });
});

/** DELETE /api/music/library/:id */
musicRouter.delete("/library/:id", (req, res) => {
  const info = db
    .prepare(`DELETE FROM music_library WHERE id = ? AND user_id = ?`)
    .run(req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ success: false, error: "not found" });
  res.json({ success: true });
});

/** GET /api/music/history — ประวัติการฟัง (เทียบ getHistory/renderHistory เดิม) */
musicRouter.get("/history", (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM music_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100`)
    .all(req.userId);
  res.json({ success: true, history: rows });
});

const playedSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  type: z.enum(["youtube", "audio"]),
});

/** POST /api/music/played — บันทึกว่าเพิ่งเล่นเพลงนี้ (เทียบ addToHistory เดิม, เพิ่ม playCount ถ้าเล่นซ้ำ) */
musicRouter.post("/played", (req, res) => {
  const parsed = playedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const d = parsed.data;

  const existing = db
    .prepare(`SELECT id, play_count FROM music_history WHERE user_id = ? AND url = ?`)
    .get(req.userId, d.url) as { id: number; play_count: number } | undefined;

  if (existing) {
    db.prepare(`UPDATE music_history SET play_count = ?, played_at = datetime('now'), title = ? WHERE id = ?`).run(
      existing.play_count + 1,
      d.title ?? null,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO music_history (user_id, url, title, type) VALUES (?, ?, ?, ?)`
    ).run(req.userId, d.url, d.title ?? null, d.type);
  }
  res.json({ success: true });
});
