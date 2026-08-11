import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { estimateKcalBurned } from "../services/pedometer.js";

export const pedometerRouter = Router();

/** GET /api/pedometer/today */
pedometerRouter.get("/today", (req, res) => {
  const row = db.prepare(`SELECT * FROM steps_daily WHERE user_id = ? AND day = date('now')`).get(req.userId) as any;
  res.json({ success: true, data: row || { day: null, steps: 0, distance_km: 0, kcal_burned: 0, seconds: 0 } });
});

/** POST /api/pedometer/log — บันทึก/อัปเดตข้อมูลก้าววันนี้ (upsert) */
const logSchema = z.object({
  steps: z.number().int().nonnegative(),
  distanceKm: z.number().nonnegative(),
  seconds: z.number().int().nonnegative(),
  weightKg: z.number().positive().optional(),
});

pedometerRouter.post("/log", (req, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const { steps, distanceKm, seconds, weightKg } = parsed.data;
  const kcalBurned = estimateKcalBurned(distanceKm, seconds, weightKg ?? 65);

  db.prepare(
    `INSERT INTO steps_daily (day, user_id, steps, distance_km, kcal_burned, seconds, updated_at)
     VALUES (date('now'), @userId, @steps, @distanceKm, @kcalBurned, @seconds, datetime('now'))
     ON CONFLICT(day, user_id) DO UPDATE SET
       steps = @steps, distance_km = @distanceKm, kcal_burned = @kcalBurned,
       seconds = @seconds, updated_at = datetime('now')`
  ).run({ steps, distanceKm, kcalBurned, seconds, userId: req.userId });

  res.json({ success: true, kcalBurned });
});
