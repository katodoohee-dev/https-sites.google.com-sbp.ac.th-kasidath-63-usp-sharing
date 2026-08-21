import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";

export const waterRouter = Router();

waterRouter.get("/today", (req, res) => {
  const row = db.prepare(`SELECT glasses, goal_glasses FROM water_log WHERE user_id = ? AND day = date('now')`).get(req.userId) as { glasses: number; goal_glasses: number } | undefined;
  res.json({ success: true, glasses: row?.glasses ?? 0, goalGlasses: row?.goal_glasses ?? 8 });
});

const addSchema = z.object({ delta: z.number().int().min(-20).max(20).default(1), glasses: z.number().int().min(0).max(30).optional() });

function updateWater(req: any, res: any) {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const current = db.prepare(`SELECT glasses, goal_glasses FROM water_log WHERE user_id = ? AND day = date('now')`).get(req.userId) as { glasses: number; goal_glasses: number } | undefined;
  const nextGlasses = parsed.data.glasses !== undefined ? parsed.data.glasses : Math.max(0, (current?.glasses ?? 0) + parsed.data.delta);
  db.prepare(`INSERT INTO water_log (day, user_id, glasses, goal_glasses, updated_at) VALUES (date('now'), ?, ?, ?, datetime('now')) ON CONFLICT(day, user_id) DO UPDATE SET glasses = ?, updated_at = datetime('now')`).run(req.userId, nextGlasses, current?.goal_glasses ?? 8, nextGlasses);
  res.json({ success: true, glasses: nextGlasses, goalGlasses: current?.goal_glasses ?? 8 });
}

waterRouter.post("/add", updateWater);
waterRouter.post("/", updateWater);

const goalSchema = z.object({ goalGlasses: z.number().int().min(1).max(30) });
waterRouter.patch("/goal", (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  db.prepare(`INSERT INTO water_log (day, user_id, glasses, goal_glasses, updated_at) VALUES (date('now'), ?, 0, ?, datetime('now')) ON CONFLICT(day, user_id) DO UPDATE SET goal_glasses = ?, updated_at = datetime('now')`).run(req.userId, parsed.data.goalGlasses, parsed.data.goalGlasses);
  res.json({ success: true, goalGlasses: parsed.data.goalGlasses });
});
