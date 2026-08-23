import { Router } from "express";
import { db } from "../db/index.js";

export const diaryRouter = Router();

diaryRouter.get("/", (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(`SELECT * FROM food_entries WHERE user_id = ? AND date(created_at) = date(?) ORDER BY created_at DESC`)
    .all(req.userId, date);
  res.json({ success: true, date, entries: rows });
});

diaryRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: "invalid id" });
  const info = db.prepare(`DELETE FROM food_entries WHERE id = ? AND user_id = ?`).run(id, req.userId);
  if (info.changes === 0) return res.status(404).json({ success: false, error: "not found" });
  res.json({ success: true });
});

export const statsRouter = Router();

statsRouter.get("/today", (req, res) => {
  const totals = db
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
    .get(req.userId) as any;

  const activity = db
    .prepare(
      `SELECT
        COALESCE((SELECT SUM(kcal_burned) FROM workouts WHERE user_id = ? AND date(created_at) = date('now')), 0)
        + COALESCE((SELECT kcal_burned FROM steps_daily WHERE user_id = ? AND day = date('now')), 0) AS burned`
    )
    .get(req.userId, req.userId) as { burned: number };

  const user = db
    .prepare(`SELECT goal_kcal, goal_protein, goal_carb, goal_fat FROM users WHERE id = ?`)
    .get(req.userId) as any;

  res.json({
    success: true,
    totals: {
      ...totals,
      burned: Number(activity?.burned ?? 0),
      goalKcal: Number(user?.goal_kcal ?? 2000),
      proteinGoal: Number(user?.goal_protein ?? 120),
      carbGoal: Number(user?.goal_carb ?? 240),
      fatGoal: Number(user?.goal_fat ?? 65),
    },
  });
});

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

  const activityRows = db
    .prepare(
      `SELECT day, COALESCE(SUM(burn),0) AS burn, COALESCE(SUM(steps),0) AS steps FROM (
         SELECT date(created_at) AS day, COALESCE(SUM(kcal_burned),0) AS burn, 0 AS steps
         FROM workouts WHERE user_id = ? AND created_at >= datetime('now','-6 days') GROUP BY date(created_at)
         UNION ALL
         SELECT day, COALESCE(kcal_burned,0) AS burn, COALESCE(steps,0) AS steps
         FROM steps_daily WHERE user_id = ? AND day >= date('now','-6 days')
       ) GROUP BY day ORDER BY day ASC`
    )
    .all(req.userId, req.userId) as { day: string; burn: number; steps: number }[];

  const byDay = new Map<string, { calories: number; burn: number; steps: number }>();
  for (const row of rows) byDay.set(row.day, { calories: Number(row.calories), burn: 0, steps: 0 });
  for (const row of activityRows) {
    const current = byDay.get(row.day) ?? { calories: 0, burn: 0, steps: 0 };
    current.burn += Number(row.burn ?? 0);
    current.steps += Number(row.steps ?? 0);
    byDay.set(row.day, current);
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({
    day,
    calories: value.calories,
    kcal: value.calories,
    burn: value.burn,
    steps: value.steps,
  }));
  const avg = days.length ? days.reduce((s, r) => s + r.calories, 0) / days.length : 0;
  res.json({ success: true, days, averageCalories: Math.round(avg) });
});
