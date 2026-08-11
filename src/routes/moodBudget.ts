import { Router } from "express";
import { z } from "zod";
import { MOOD_DB, recommendMenus, generateBudgetPlan } from "../services/moodBudget.js";

export const moodRouter = Router();

/** GET /api/mood/list — รายชื่อ mood ทั้งหมด (สำหรับ render mood grid) */
moodRouter.get("/list", (_req, res) => {
  res.json({ success: true, moods: MOOD_DB.map(({ mood_id, icon, name_th }) => ({ mood_id, icon, name_th })) });
});

/** GET /api/mood/recommend?mood=stressed&meal=breakfast|main */
moodRouter.get("/recommend", (req, res) => {
  const schema = z.object({ mood: z.string(), meal: z.enum(["breakfast", "main"]).default("main") });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  try {
    const { moodProfile, ranked } = recommendMenus(parsed.data.mood, parsed.data.meal);
    res.json({ success: true, coachingMessage: moodProfile.coaching_message, recommendations: ranked });
  } catch (err: any) {
    res.status(err.code === "not_found" ? 404 : 500).json({ success: false, error: err.message });
  }
});

export const budgetRouter = Router();

/** POST /api/budget/plan — { monthlyBudget, conditions:[], allergies:[], days? } */
budgetRouter.post("/plan", (req, res) => {
  const schema = z.object({
    monthlyBudget: z.number().positive(),
    conditions: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    days: z.number().int().positive().max(30).default(7),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const { monthlyBudget, conditions, allergies, days } = parsed.data;
  const plan = generateBudgetPlan(monthlyBudget, conditions, allergies, days);
  res.json({ success: true, tier: monthlyBudget <= 3000 ? "eco" : "mixed", plan });
});
