import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";

export const diaryRouter = Router();

/** GET /api/diary?date=YYYY-MM-DD — รายการอาหารของวันนั้น (default = วันนี้) */
diaryRouter.get("/", (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(`SELECT * FROM food_entries WHERE user_id = ? AND date(created_at) = date(?) ORDER BY created_at DESC`)
    .all(req.userId, date);
  res.json({ success: true, date, entries: rows });
});

/** DELETE /api/diary/:id */
diaryRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: "invalid id" });
  const info = db.prepare(`DELETE FROM food_entries WHERE id = ? AND user_id = ?`).run(id, req.userId);
  if (info.changes === 0) return res.status(404).json({ success: false, error: "not found" });
  res.json({ success: true });
});

export const statsRouter = Router();

/** GET /api/stats/today — สรุปแคล/สารอาหารรวมของวันนี้ (เทียบ renderStats/updateStatsUI เดิม) */
statsRouter.get("/today", (req, res) => {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(calories),0) AS calories,
        COALESCE(SUM(protein),0) AS protein,
        COALESCE(SUM(carbs),0) AS carbs,
        COALESCE(SUM(fat),0) AS fat,
        COALESCE(SUM(sodium),0) AS sodium,
        COALESCE(SUM(fiber),0) AS fiber,
        COUNT(*) AS entryCount
       FROM food_entries WHERE user_id = ? AND date(created_at) = date('now')`
    )
    .get(req.userId);
  res.json({ success: true, totals: row });
});

/** GET /api/stats/weekly — ค่าเฉลี่ยแคลอรีย้อนหลัง 7 วัน (เทียบ getWeeklyFoodAverage เดิม) */
statsRouter.get("/weekly", (req, res) => {
  const rows = db
    .prepare(
      `SELECT date(created_at) AS day, COALESCE(SUM(calories),0) AS calories
       FROM food_entries
       WHERE user_id = ? AND created_at >= datetime('now', '-6 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    )
    .all(req.userId) as { day: string; calories: number }[];

  const avg = rows.length ? rows.reduce((s, r) => s + r.calories, 0) / rows.length : 0;
  res.json({ success: true, days: rows, averageCalories: Math.round(avg) });
});
