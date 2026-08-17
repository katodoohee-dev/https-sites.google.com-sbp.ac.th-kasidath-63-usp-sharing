import webpush from "web-push";
import { db } from "../db/index.js";

/**
 * Scheduler แจ้งเตือนอัตโนมัติ — ทำงานจริงแค่ 2 ประเภทที่มีข้อมูลจริงรองรับ:
 *   1. mealReminder: เตือนถ้าถึงช่วงมื้อกลางวัน/เย็นแล้วยังไม่บันทึกมื้อนั้นเลย
 *   2. streakRisk: เตือนตอนใกล้เที่ยงคืนถ้ายังไม่เช็คอินวันนี้
 *
 * ⚠️ ข้อจำกัดที่ต้องรู้ก่อนใช้จริง:
 * - waterReminder / weeklyInsight ใน settings มีอยู่แต่ scheduler นี้ "ไม่ส่ง" เพราะ
 *   ไม่มีตารางเก็บปริมาณน้ำดื่มจริงในระบบ และยังไม่มี insight generator รายสัปดาห์
 *   (ต้องทำเพิ่มถ้าจะให้ 2 ตัวนี้ทำงานจริง)
 * - smartTiming (ให้ AI เลือกเวลาเอง) ยังไม่ได้ implement — ตอนนี้ใช้เวลาคงที่เสมอ
 * - เช็คเวลาเป็นเวลาของ "server" เท่านั้น ไม่รู้ timezone จริงของผู้ใช้แต่ละคน —
 *   ถ้า deploy server คนละ timezone กับผู้ใช้ส่วนใหญ่ เวลาที่เตือนจะคลาดเคลื่อน
 * - quiet hours เช็คแบบ string เทียบ HH:MM ตรงๆ (รองรับข้ามเที่ยงคืนแบบ 22:00-07:00)
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // เช็คทุก 5 นาที พอสำหรับ granularity ระดับชั่วโมง

interface UserRow {
  id: string;
}
interface SettingsRow {
  meal_reminder: number;
  streak_risk: number;
  quiet_start: string;
  quiet_end: string;
}
interface PushSubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function inQuietHours(now: Date, start: string, end: string): boolean {
  const hhmm = now.toTimeString().slice(0, 5); // "HH:MM" ตามเวลา server
  if (start === end) return false;
  if (start < end) return hhmm >= start && hhmm < end;
  // ช่วงข้ามเที่ยงคืน เช่น 22:00 -> 07:00
  return hhmm >= start || hhmm < end;
}

async function sendToUser(userId: string, title: string, body: string): Promise<void> {
  const subs = db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`).all(userId) as PushSubRow[];
  if (subs.length === 0) return;
  const payload = JSON.stringify({ title, body });
  await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch((err: { statusCode?: number }) => {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(s.id);
        }
      })
    )
  );
}

function alreadySent(userId: string, type: string, day: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM notification_log WHERE user_id = ? AND type = ? AND day = ?`).get(userId, type, day));
}

function markSent(userId: string, type: string, day: string): void {
  db.prepare(`INSERT OR IGNORE INTO notification_log (user_id, type, day) VALUES (?, ?, ?)`).run(userId, type, day);
}

async function tick(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();
  const day = now.toISOString().slice(0, 10);

  // เฉพาะ user ที่มีอย่างน้อย 1 push subscription เท่านั้น ไม่งั้น query settings ทุกคนทิ้งเปล่าๆ
  const users = db
    .prepare(`SELECT DISTINCT user_id AS id FROM push_subscriptions`)
    .all() as UserRow[];

  for (const u of users) {
    const settings = db.prepare(`SELECT * FROM notification_settings WHERE user_id = ?`).get(u.id) as SettingsRow | undefined;
    if (!settings) continue;
    if (inQuietHours(now, settings.quiet_start, settings.quiet_end)) continue;

    // มื้อกลางวัน: เตือนตอน 12:00-12:59 ถ้ายังไม่บันทึก
    if (settings.meal_reminder && hour === 12 && !alreadySent(u.id, "meal_lunch", day)) {
      const has = db
        .prepare(`SELECT 1 FROM food_entries WHERE user_id = ? AND meal_type = 'lunch' AND date(created_at) = date('now')`)
        .get(u.id);
      if (!has) {
        await sendToUser(u.id, "ถึงเวลามื้อกลางวันแล้ว 🍚", "อย่าลืมบันทึกมื้อกลางวันของวันนี้นะ");
      }
      markSent(u.id, "meal_lunch", day);
    }

    // มื้อเย็น: เตือนตอน 19:00-19:59 ถ้ายังไม่บันทึก
    if (settings.meal_reminder && hour === 19 && !alreadySent(u.id, "meal_dinner", day)) {
      const has = db
        .prepare(`SELECT 1 FROM food_entries WHERE user_id = ? AND meal_type = 'dinner' AND date(created_at) = date('now')`)
        .get(u.id);
      if (!has) {
        await sendToUser(u.id, "ถึงเวลามื้อเย็นแล้ว 🍜", "อย่าลืมบันทึกมื้อเย็นของวันนี้นะ");
      }
      markSent(u.id, "meal_dinner", day);
    }

    // streak เสี่ยงขาด: เตือนตอน 21:00-21:59 ถ้ายังไม่เช็คอินวันนี้
    if (settings.streak_risk && hour === 21 && !alreadySent(u.id, "streak_risk", day)) {
      const checkin = db.prepare(`SELECT last_date FROM checkins WHERE user_id = ?`).get(u.id) as { last_date: string | null } | undefined;
      if (checkin?.last_date !== day) {
        await sendToUser(u.id, "streak ของคุณกำลังจะขาด 🔥", "เช็คอินวันนี้ก่อนเที่ยงคืน กันหลุด streak");
      }
      markSent(u.id, "streak_risk", day);
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** เรียกครั้งเดียวตอน server start — no-op ถ้ายังไม่ได้ตั้ง VAPID (กันแจ้ง error รัวๆ ทุก 5 นาทีตอนยังไม่ได้ตั้งค่า) */
export function startReminderScheduler(vapidConfigured: boolean): void {
  if (!vapidConfigured) {
    console.log("[reminders] ข้าม scheduler เพราะยังไม่ได้ตั้ง VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY");
    return;
  }
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    void tick().catch((err) => console.error("[reminders] tick error:", err));
  }, CHECK_INTERVAL_MS);
  console.log(`[reminders] scheduler เริ่มทำงาน — เช็คทุก ${CHECK_INTERVAL_MS / 60000} นาที`);
}
