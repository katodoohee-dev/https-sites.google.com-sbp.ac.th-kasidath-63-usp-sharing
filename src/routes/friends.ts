import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const friendsRouter = Router();
export const weekSummaryRouter = Router();

interface FriendListRow { id: string; name: string | null; streak: number; }

friendsRouter.get("/", (req, res) => {
  const rows = db.prepare(`SELECT u.id AS id, u.display_name AS name, COALESCE(c.streak, 0) AS streak FROM friendships f JOIN users u ON u.id = f.friend_id LEFT JOIN checkins c ON c.user_id = u.id WHERE f.user_id = ? ORDER BY streak DESC`).all(req.userId) as FriendListRow[];
  res.json(rows.map((r) => ({ id: r.id, name: r.name ?? "เพื่อน", streak: r.streak })));
});

friendsRouter.post("/cheer/:id", (req, res) => {
  const friendId = req.params.id;
  const day = new Date().toISOString().slice(0, 10);
  const friendship = db.prepare(`SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?`).get(req.userId, friendId);
  if (!friendship) return res.status(404).json({ success: false, error: "ไม่พบเพื่อนคนนี้ในรายชื่อของคุณ" });
  try { db.prepare(`INSERT INTO friend_cheers (from_user_id, to_user_id, day) VALUES (?, ?, ?)`).run(req.userId, friendId, day); } catch {}
  res.json({ success: true });
});

friendsRouter.get("/invite-code", (req, res) => {
  let row = db.prepare(`SELECT code FROM invite_codes WHERE user_id = ?`).get(req.userId) as { code: string } | undefined;
  if (!row) { const code = crypto.randomBytes(4).toString("hex").toUpperCase(); db.prepare(`INSERT INTO invite_codes (code, user_id) VALUES (?, ?)`).run(code, req.userId); row = { code }; }
  res.json({ code: row.code });
});

const addFriendSchema = z.object({ code: z.string().min(1) });
friendsRouter.post("/add", (req, res) => {
  const parsed = addFriendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "กรุณากรอกโค้ดเชิญ" });
  const owner = db.prepare(`SELECT user_id FROM invite_codes WHERE code = ?`).get(parsed.data.code.toUpperCase()) as { user_id: string } | undefined;
  if (!owner) return res.status(404).json({ success: false, error: "ไม่พบโค้ดเชิญนี้" });
  if (owner.user_id === req.userId) return res.status(400).json({ success: false, error: "ใช้โค้ดเชิญของตัวเองไม่ได้" });
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)`).run(req.userId, owner.user_id, now);
  db.prepare(`INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)`).run(owner.user_id, req.userId, now);
  res.json({ success: true });
});

const locationSchema = z.object({
  friendId: z.string().min(1),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  heading: z.number().finite().optional(),
  speedMps: z.number().nonnegative().optional(),
});

friendsRouter.post("/location/publish", (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid location" });
  const d = parsed.data;
  if (d.friendId !== "none") {
    const friendship = db.prepare(`SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?`).get(req.userId, d.friendId);
    if (!friendship) return res.status(404).json({ success: false, error: "friend_not_found" });
  }
  db.prepare(`INSERT INTO friend_locations(user_id,friend_id,lat,lng,accuracy,heading,speed_mps,updated_at) VALUES(?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(user_id,friend_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,heading=excluded.heading,speed_mps=excluded.speed_mps,updated_at=datetime('now')`).run(req.userId,d.friendId,d.lat,d.lng,d.accuracy??null,d.heading??null,d.speedMps??null);
  res.json({ success: true, publishedAt: new Date().toISOString() });
});

friendsRouter.post("/location/share", (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  db.prepare(`INSERT INTO friend_location_settings(user_id,enabled,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=datetime('now')`).run(req.userId, enabled ? 1 : 0);
  res.json({ success: true, enabled });
});

friendsRouter.get("/location/status", (req, res) => {
  const settings = db.prepare(`SELECT enabled,updated_at AS updatedAt FROM friend_location_settings WHERE user_id=?`).get(req.userId) as {enabled:number;updatedAt:string}|undefined;
  const locations = db.prepare(`SELECT friend_id AS friendId,lat,lng,accuracy,heading,speed_mps AS speedMps,updated_at AS updatedAt FROM friend_locations WHERE user_id=? ORDER BY updated_at DESC`).all(req.userId);
  res.json({ success: true, enabled: !!settings?.enabled, updatedAt: settings?.updatedAt ?? null, locations });
});

weekSummaryRouter.get("/week-summary", (req, res) => {
  const user = db.prepare(`SELECT goal_kcal FROM users WHERE id = ?`).get(req.userId) as { goal_kcal: number } | undefined;
  const goalKcal = user?.goal_kcal ?? 2000;
  const checkin = db.prepare(`SELECT streak FROM checkins WHERE user_id = ?`).get(req.userId) as { streak: number } | undefined;
  const dayRows = db.prepare(`SELECT date(created_at) AS day, SUM(calories) AS calories FROM food_entries WHERE user_id = ? AND created_at >= datetime('now', '-7 days') GROUP BY date(created_at)`).all(req.userId) as { day: string; calories: number }[];
  const avgKcal = dayRows.length > 0 ? Math.round(dayRows.reduce((sum, d) => sum + d.calories, 0) / dayRows.length) : 0;
  const daysOnGoal = dayRows.filter((d) => d.calories > 0 && d.calories <= goalKcal * 1.1).length;
  res.json({ streak: checkin?.streak ?? 0, avgKcal, daysOnGoal });
});
