import { Router } from "express";
import { db } from "../db/index.js";
import { checkinGreeting, computeCheckin, todayStr, type CheckinRow } from "../services/checkin.js";

export const checkinRouter = Router();

function getOrCreateRow(userId: string): CheckinRow {
  let row = db.prepare(`SELECT * FROM checkins WHERE user_id = ?`).get(userId) as CheckinRow | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO checkins (user_id, streak, last_date, freeze_available, freeze_month_key) VALUES (?, 0, NULL, 2, NULL)`
    ).run(userId);
    row = { streak: 0, last_date: null, freeze_available: 2, freeze_month_key: null };
  }
  return row;
}

/** GET /api/checkin/today — สถานะ streak + ข้อความทักทาย (เทียบ renderCheckinCard เดิม) */
checkinRouter.get("/today", (req, res) => {
  const row = getOrCreateRow(req.userId);
  const today = todayStr();
  const alreadyCheckedInToday = row.last_date === today;
  res.json({
    success: true,
    streak: row.streak,
    lastDate: row.last_date,
    freezeAvailable: row.freeze_available,
    alreadyCheckedInToday,
    greeting: checkinGreeting(row.streak, alreadyCheckedInToday),
  });
});

/** POST /api/checkin — เช็คอินวันนี้ (เทียบ doCheckin เดิม, มีกลไก freeze card กันขาด) */
checkinRouter.post("/", (req, res) => {
  const row = getOrCreateRow(req.userId);
  const result = computeCheckin(row);

  if (!result.alreadyCheckedInToday) {
    db.prepare(
      `UPDATE checkins SET streak = ?, last_date = ?, freeze_available = ?, freeze_month_key = ?, updated_at = datetime('now') WHERE user_id = ?`
    ).run(result.streak, result.lastDate, result.freezeAvailable, result.lastDate!.slice(0, 7), req.userId);
  }

  res.json({
    success: true,
    streak: result.streak,
    freezeAvailable: result.freezeAvailable,
    alreadyCheckedInToday: result.alreadyCheckedInToday,
    usedFreeze: result.usedFreeze,
    greeting: checkinGreeting(result.streak, true),
  });
});
