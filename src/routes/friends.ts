import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const friendsRouter = Router();
export const weekSummaryRouter = Router();

interface FriendListRow {
  id: string;
  name: string | null;
  streak: number;
}

/** GET /api/friends — รายชื่อเพื่อนพร้อม streak ปัจจุบัน (คืนเป็น array ตรง type Friend[]) */
friendsRouter.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id AS id, u.display_name AS name, COALESCE(c.streak, 0) AS streak
       FROM friendships f
       JOIN users u ON u.id = f.friend_id
       LEFT JOIN checkins c ON c.user_id = u.id
       WHERE f.user_id = ?
       ORDER BY streak DESC`
    )
    .all(req.userId) as FriendListRow[];

  res.json(rows.map((r) => ({ id: r.id, name: r.name ?? "เพื่อน", streak: r.streak })));
});

/** POST /api/friends/cheer/:id — ให้กำลังใจเพื่อน (จำกัด 1 ครั้ง/คน/วัน) */
friendsRouter.post("/cheer/:id", (req, res) => {
  const friendId = req.params.id;
  const day = new Date().toISOString().slice(0, 10);

  const friendship = db
    .prepare(`SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?`)
    .get(req.userId, friendId);
  if (!friendship) {
    return res.status(404).json({ success: false, error: "ไม่พบเพื่อนคนนี้ในรายชื่อของคุณ" });
  }

  try {
    db.prepare(
      `INSERT INTO friend_cheers (from_user_id, to_user_id, day) VALUES (?, ?, ?)`
    ).run(req.userId, friendId, day);
  } catch {
    // UNIQUE constraint -> เชียร์คนนี้ไปแล้ววันนี้ ถือว่าสำเร็จเหมือนเดิม (idempotent)
  }

  res.json({ success: true });
});

/** GET /api/friends/invite-code — โค้ดเชิญของผู้ใช้ (สร้างครั้งแรกถ้ายังไม่มี) */
friendsRouter.get("/invite-code", (req, res) => {
  let row = db.prepare(`SELECT code FROM invite_codes WHERE user_id = ?`).get(req.userId) as
    | { code: string }
    | undefined;

  if (!row) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    db.prepare(`INSERT INTO invite_codes (code, user_id) VALUES (?, ?)`).run(code, req.userId);
    row = { code };
  }

  res.json({ code: row.code });
});

const addFriendSchema = z.object({ code: z.string().min(1) });

/** POST /api/friends/add — เพิ่มเพื่อนด้วยโค้ดเชิญ (ผูกทั้งสองทิศทาง) */
friendsRouter.post("/add", (req, res) => {
  const parsed = addFriendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "กรุณากรอกโค้ดเชิญ" });
  }

  const owner = db
    .prepare(`SELECT user_id FROM invite_codes WHERE code = ?`)
    .get(parsed.data.code.toUpperCase()) as { user_id: string } | undefined;

  if (!owner) {
    return res.status(404).json({ success: false, error: "ไม่พบโค้ดเชิญนี้" });
  }
  if (owner.user_id === req.userId) {
    return res.status(400).json({ success: false, error: "ใช้โค้ดเชิญของตัวเองไม่ได้" });
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)`
  ).run(req.userId, owner.user_id, now);
  db.prepare(
    `INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)`
  ).run(owner.user_id, req.userId, now);

  res.json({ success: true });
});

/** GET /api/stats/week-summary — สรุป streak / kcal เฉลี่ย / วันตามเป้าของ 7 วันล่าสุด */
weekSummaryRouter.get("/week-summary", (req, res) => {
  const user = db.prepare(`SELECT goal_kcal FROM users WHERE id = ?`).get(req.userId) as
    | { goal_kcal: number }
    | undefined;
  const goalKcal = user?.goal_kcal ?? 2000;

  const checkin = db.prepare(`SELECT streak FROM checkins WHERE user_id = ?`).get(req.userId) as
    | { streak: number }
    | undefined;

  const dayRows = db
    .prepare(
      `SELECT date(created_at) AS day, SUM(calories) AS calories
       FROM food_entries
       WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
       GROUP BY date(created_at)`
    )
    .all(req.userId) as { day: string; calories: number }[];

  const avgKcal =
    dayRows.length > 0 ? Math.round(dayRows.reduce((sum, d) => sum + d.calories, 0) / dayRows.length) : 0;

  // "ตามเป้า" = แคลอรีวันนั้นไม่เกินเป้า +10%
  const daysOnGoal = dayRows.filter((d) => d.calories > 0 && d.calories <= goalKcal * 1.1).length;

  res.json({
    streak: checkin?.streak ?? 0,
    avgKcal,
    daysOnGoal,
  });
});
