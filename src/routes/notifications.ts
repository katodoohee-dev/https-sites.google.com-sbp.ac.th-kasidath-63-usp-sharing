import { Router } from "express";
import { z } from "zod";
import webpush from "web-push";
import { db } from "../db/index.js";

export const notificationsRouter = Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
export const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (vapidConfigured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface SettingsRow { meal_reminder: number; water_reminder: number; streak_risk: number; weekly_insight: number; smart_timing: number; quiet_start: string; quiet_end: string; }
function toApi(row: SettingsRow) { return { mealReminder: !!row.meal_reminder, waterReminder: !!row.water_reminder, streakRisk: !!row.streak_risk, weeklyInsight: !!row.weekly_insight, smartTiming: !!row.smart_timing, quietStart: row.quiet_start, quietEnd: row.quiet_end }; }
function getOrCreate(userId: string): SettingsRow {
  let row = db.prepare(`SELECT * FROM notification_settings WHERE user_id = ?`).get(userId) as SettingsRow | undefined;
  if (!row) { db.prepare(`INSERT INTO notification_settings (user_id) VALUES (?)`).run(userId); row = db.prepare(`SELECT * FROM notification_settings WHERE user_id = ?`).get(userId) as SettingsRow; }
  return row;
}

/** GET /api/notifications — lightweight notification center summary. */
notificationsRouter.get("/", (req, res) => {
  const settings = getOrCreate(req.userId);
  const unread = db.prepare(`SELECT COUNT(*) AS count FROM notification_log WHERE user_id = ? AND sent_at >= datetime('now','-7 days')`).get(req.userId) as {count:number};
  res.json({ success: true, items: [], unread: 0, recentSent: Number(unread?.count ?? 0), settings: toApi(settings), vapidConfigured });
});

notificationsRouter.get("/settings", (req, res) => res.json({ success: true, ...toApi(getOrCreate(req.userId)) }));
notificationsRouter.get("/vapid-public-key", (_req, res) => {
  if (!vapidConfigured) return res.status(503).json({ success: false, error: "vapid_not_configured" });
  res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
});

const subscribeSchema = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) });
notificationsRouter.post("/subscribe", (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "invalid_subscription", details: parsed.error.flatten() });
  const { endpoint, keys } = parsed.data;
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`).run(req.userId, endpoint, keys.p256dh, keys.auth);
  res.json({ success: true });
});
notificationsRouter.post("/unsubscribe", (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) return res.status(400).json({ success: false, error: "endpoint_required" });
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`).run(endpoint, req.userId);
  res.json({ success: true });
});

const patchSchema = z.object({ mealReminder: z.boolean().optional(), waterReminder: z.boolean().optional(), streakRisk: z.boolean().optional(), weeklyInsight: z.boolean().optional(), smartTiming: z.boolean().optional(), quietStart: z.string().optional(), quietEnd: z.string().optional() });
const FIELD_MAP: Record<string, string> = { mealReminder: "meal_reminder", waterReminder: "water_reminder", streakRisk: "streak_risk", weeklyInsight: "weekly_insight", smartTiming: "smart_timing", quietStart: "quiet_start", quietEnd: "quiet_end" };
notificationsRouter.patch("/settings", (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "invalid_params", details: parsed.error.flatten() });
  getOrCreate(req.userId);
  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (entries.length > 0) {
    const setClauses = entries.map(([k]) => `${FIELD_MAP[k]} = ?`).join(", ");
    const values = entries.map(([k, v]) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
    db.prepare(`UPDATE notification_settings SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`).run(...values, req.userId);
  }
  res.json({ success: true, ...toApi(getOrCreate(req.userId)) });
});

interface PushSubRow { id: number; endpoint: string; p256dh: string; auth: string; }
notificationsRouter.post("/test", async (req, res) => {
  if (!vapidConfigured) return res.status(503).json({ success: false, error: "vapid_not_configured", note: "ตั้ง VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY บน backend ก่อนใช้งาน push" });
  const subs = db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`).all(req.userId) as PushSubRow[];
  if (subs.length === 0) return res.status(404).json({ success: false, error: "no_subscription", note: "ยังไม่มีอุปกรณ์ที่ subscribe การแจ้งเตือนไว้" });
  const payload = JSON.stringify({ title: "WK Health App", body: "นี่คือการแจ้งเตือนทดสอบ 🔔 ระบบทำงานปกติ" });
  const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)));
  results.forEach((r, i) => { if (r.status === "rejected") { const statusCode = (r.reason as {statusCode?:number})?.statusCode; if (statusCode === 410 || statusCode === 404) db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(subs[i]!.id); } });
  const sent = results.filter((r) => r.status === "fulfilled").length;
  res.json({ success: sent > 0, sent, total: subs.length });
});
