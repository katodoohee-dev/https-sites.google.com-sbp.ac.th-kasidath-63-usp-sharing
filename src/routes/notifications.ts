import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";

export const notificationsRouter = Router();

interface SettingsRow {
  meal_reminder: number;
  water_reminder: number;
  streak_risk: number;
  weekly_insight: number;
  smart_timing: number;
  quiet_start: string;
  quiet_end: string;
}

function toApi(row: SettingsRow) {
  return {
    mealReminder: !!row.meal_reminder,
    waterReminder: !!row.water_reminder,
    streakRisk: !!row.streak_risk,
    weeklyInsight: !!row.weekly_insight,
    smartTiming: !!row.smart_timing,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
  };
}

function getOrCreate(userId: string): SettingsRow {
  let row = db.prepare(`SELECT * FROM notification_settings WHERE user_id = ?`).get(userId) as
    | SettingsRow
    | undefined;
  if (!row) {
    db.prepare(`INSERT INTO notification_settings (user_id) VALUES (?)`).run(userId);
    row = db.prepare(`SELECT * FROM notification_settings WHERE user_id = ?`).get(userId) as SettingsRow;
  }
  return row;
}

/** GET /api/notifications/settings */
notificationsRouter.get("/settings", (req, res) => {
  res.json(toApi(getOrCreate(req.userId)));
});

const patchSchema = z.object({
  mealReminder: z.boolean().optional(),
  waterReminder: z.boolean().optional(),
  streakRisk: z.boolean().optional(),
  weeklyInsight: z.boolean().optional(),
  smartTiming: z.boolean().optional(),
  quietStart: z.string().optional(),
  quietEnd: z.string().optional(),
});

const FIELD_MAP: Record<string, string> = {
  mealReminder: "meal_reminder",
  waterReminder: "water_reminder",
  streakRisk: "streak_risk",
  weeklyInsight: "weekly_insight",
  smartTiming: "smart_timing",
  quietStart: "quiet_start",
  quietEnd: "quiet_end",
};

/** PATCH /api/notifications/settings — อัปเดตทีละฟิลด์ (partial) */
notificationsRouter.patch("/settings", (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "invalid_params", details: parsed.error.flatten() });
  }

  getOrCreate(req.userId); // ensure row exists

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (entries.length > 0) {
    const setClauses = entries.map(([k]) => `${FIELD_MAP[k]} = ?`).join(", ");
    const values = entries.map(([k, v]) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
    db.prepare(
      `UPDATE notification_settings SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`
    ).run(...values, req.userId);
  }

  res.json(toApi(getOrCreate(req.userId)));
});

/**
 * POST /api/notifications/test — "ส่ง" แจ้งเตือนทดสอบ
 * ⚠️ ข้อจำกัดจริง: ระบบนี้ยังไม่มี VAPID key / push subscription หรือ Service Worker
 * จึง "ส่ง" ได้แค่บันทึก log ฝั่ง server เท่านั้น ยังไม่ใช่ push notification จริงที่ขึ้นบนมือถือ
 * ต้องตั้งค่า web-push (VAPID keys) และ subscribe ผ่าน Service Worker ในฝั่ง frontend ก่อน
 * ถึงจะส่งขึ้นจอเครื่องผู้ใช้ได้จริง
 */
notificationsRouter.post("/test", (req, res) => {
  console.log(`[notifications:test] would send push to user=${req.userId} at ${new Date().toISOString()}`);
  res.json({ success: true, note: "บันทึก log แล้ว — ยังไม่ใช่ push จริงจนกว่าจะตั้งค่า VAPID/Service Worker" });
});
