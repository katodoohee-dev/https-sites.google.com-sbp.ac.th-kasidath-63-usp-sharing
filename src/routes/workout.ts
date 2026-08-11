import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { estimateExerciseKcal } from "../services/bodyMetrics.js";
import { callDeepSeek, parseAiJson } from "../services/deepseek.js";

export const workoutRouter = Router();

const logSchema = z.object({
  exerciseName: z.string().min(1),
  minutes: z.number().int().positive().default(10),
  weightKg: z.number().positive().optional(),
  kcalOverride: z.number().positive().optional(),
  sourceKey: z.string().optional(),
});

/** POST /api/workout/log — บันทึกการออกกำลังกาย (เทียบ estimateExerciseKcal + บันทึกลง store.workouts เดิม) */
workoutRouter.post("/log", (req, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const d = parsed.data;

  // กันบันทึกซ้ำวันเดียวกันจาก sourceKey เดียวกัน (เทียบ findLoggedWorkout เดิม)
  if (d.sourceKey) {
    const existing = db
      .prepare(
        `SELECT id FROM workouts WHERE user_id = ? AND source_key = ? AND date(created_at) = date('now')`
      )
      .get(req.userId, d.sourceKey);
    if (existing) {
      return res.status(409).json({ success: false, error: "บันทึกท่านี้ไปแล้ววันนี้", code: "already_logged" });
    }
  }

  const kcalBurned = estimateExerciseKcal(d.weightKg ?? 65, d.minutes, d.kcalOverride);
  const info = db
    .prepare(
      `INSERT INTO workouts (user_id, exercise_name, minutes, kcal_burned, source_key)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.userId, d.exerciseName, d.minutes, kcalBurned, d.sourceKey ?? null);

  res.status(201).json({ success: true, id: info.lastInsertRowid, kcalBurned });
});

/** GET /api/workout/today-burn — รวม kcal ที่เผาผลาญจากการออกกำลังกายวันนี้ (เทียบ getTodayWorkoutBurn เดิม) */
workoutRouter.get("/today-burn", (req, res) => {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(kcal_burned),0) AS totalKcal, COUNT(*) AS count
       FROM workouts WHERE user_id = ? AND date(created_at) = date('now')`
    )
    .get(req.userId) as { totalKcal: number; count: number };
  res.json({ success: true, ...row });
});

/** GET /api/workout/history?limit=20 */
workoutRouter.get("/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = db
    .prepare(`SELECT * FROM workouts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(req.userId, limit);
  res.json({ success: true, workouts: rows });
});

/** POST /api/workout/plan — ให้ AI สร้างตารางออกกำลังกาย (เทียบ generateWorkoutPlan/buildWorkoutPrompt เดิม) */
const planSchema = z.object({
  goal: z.enum(["weight_loss", "maintenance", "muscle_gain"]),
  daysPerWeek: z.number().int().min(1).max(7).default(3),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  equipment: z.string().optional(), // เช่น "ไม่มีอุปกรณ์", "ดัมเบล"
});

workoutRouter.post("/plan", async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const { goal, daysPerWeek, level, equipment } = parsed.data;

  const goalTh = { weight_loss: "ลดน้ำหนัก", maintenance: "รักษาน้ำหนัก", muscle_gain: "เพิ่มกล้ามเนื้อ" }[goal];
  const prompt = `สร้างตารางออกกำลังกาย ${daysPerWeek} วัน/สัปดาห์ เป้าหมาย: ${goalTh} ระดับ: ${level} อุปกรณ์: ${equipment || "ไม่มี"}
ตอบเป็น JSON เท่านั้น รูปแบบ:
{"plan": [{"day": number, "exercises": [{"name": string, "minutes": number, "kcal": number}]}]}`;

  try {
    const raw = await callDeepSeek(prompt, 1200);
    const parsedJson = parseAiJson<{ plan: unknown[] }>(raw);
    const PlanSchema = z.object({
      plan: z.array(
        z.object({
          day: z.number(),
          exercises: z.array(z.object({ name: z.string(), minutes: z.number(), kcal: z.number() })),
        })
      ),
    });
    const result = PlanSchema.parse(parsedJson);
    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err instanceof SyntaxError || err?.issues) {
      return res.status(502).json({ success: false, error: "AI ตอบกลับมาเป็น JSON ที่ไม่สมบูรณ์ ลองใหม่อีกครั้ง", code: "bad_json" });
    }
    const status = err.code === "config_missing" ? 500 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});
