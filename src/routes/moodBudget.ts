import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db/index.js";
import { MOOD_DB, recommendMenus, generateBudgetPlan } from "../services/moodBudget.js";

export const moodRouter = Router();

moodRouter.get("/list", (_req, res) => {
  res.json({ success: true, moods: MOOD_DB.map(({ mood_id, icon, name_th }) => ({ mood_id, icon, name_th })) });
});

const checkinSchema = z.object({ mood: z.string().min(1), date: z.string().optional() });
moodRouter.post("/checkin", (req, res) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  const day = parsed.data.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.date) ? parsed.data.date : undefined;
  const id = `mood_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  db.prepare(`INSERT INTO mood_log (id, user_id, mood, day) VALUES (?, ?, ?, COALESCE(?, date('now')))`).run(id, req.userId, parsed.data.mood, day ?? null);
  res.status(201).json({ success: true, id });
});

moodRouter.get("/history", (req, res) => {
  const rows = db.prepare(`SELECT id, mood, day, created_at AS createdAt FROM mood_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`).all(req.userId);
  res.json({ success: true, items: rows });
});

moodRouter.get("/recommend", (req, res) => {
  const schema = z.object({ mood: z.string(), meal: z.enum(["breakfast", "main"]).default("main") });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid query" });
  try {
    const { moodProfile, ranked } = recommendMenus(parsed.data.mood, parsed.data.meal);
    res.json({ success: true, coachingMessage: moodProfile.coaching_message, recommendations: ranked });
  } catch (err: any) {
    res.status(err.code === "not_found" ? 404 : 500).json({ success: false, error: err.message });
  }
});

export const budgetRouter = Router();

budgetRouter.post("/plan", (req, res) => {
  const schema = z.object({
    monthlyBudget: z.number().positive(),
    conditions: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    days: z.number().int().positive().max(30).default(7),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  const { monthlyBudget, conditions, allergies, days } = parsed.data;
  const plan = generateBudgetPlan(monthlyBudget, conditions, allergies, days);
  res.json({ success: true, tier: monthlyBudget <= 3000 ? "eco" : "mixed", plan });
});
