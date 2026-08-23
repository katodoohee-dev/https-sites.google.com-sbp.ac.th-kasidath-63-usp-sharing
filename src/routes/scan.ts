import { Router } from "express";
import { z } from "zod";
import { analyzeFoodImage } from "../services/geminiVision.js";
import { callDeepSeek, parseAiJson } from "../services/deepseek.js";
import { db } from "../db/index.js";

export const scanRouter = Router();

const visionRequestSchema = z.object({ imageBase64: z.string().min(100, "รูปภาพไม่ถูกต้องหรือว่างเปล่า"), mimeType: z.string().default("image/jpeg") });
const NutritionSchema = z.object({ foodName: z.string(), calories: z.number().nonnegative(), protein: z.number().nonnegative().default(0), carbs: z.number().nonnegative().default(0), fat: z.number().nonnegative().default(0), sodium: z.number().nonnegative().default(0), fiber: z.number().nonnegative().default(0) });

scanRouter.post("/vision", async (req, res) => {
  const parsed = visionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  try {
    const result = await analyzeFoodImage(parsed.data.imageBase64, parsed.data.mimeType, "วิเคราะห์รูปอาหารนี้ แล้วบอกชื่อเมนู/วัตถุดิบหลักที่เห็นในภาพ ตอบสั้นกระชับเป็นภาษาไทย ไม่ต้องคำนวณแคลอรี");
    res.json({ success: true, description: result.raw });
  } catch (err: any) {
    const status = err.code === "config_missing" ? 500 : err.status && err.status < 500 ? 400 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

scanRouter.post("/calc", async (req, res) => {
  const parsed = z.object({ description: z.string().min(2) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  const prompt = `จากคำอธิบายอาหารนี้: "${parsed.data.description}"\nประมาณค่าโภชนาการ แล้วตอบเป็น JSON เท่านั้น (ไม่มีข้อความอื่น) รูปแบบ:\n{"foodName": string, "calories": number, "protein": number, "carbs": number, "fat": number, "sodium": number, "fiber": number}`;
  try {
    const nutrition = NutritionSchema.parse(parseAiJson(await callDeepSeek(prompt, 500)));
    res.json({ success: true, nutrition });
  } catch (err: any) {
    if (err instanceof SyntaxError || err?.issues) return res.status(502).json({ success: false, error: "AI ตอบกลับมาเป็น JSON ที่ไม่สมบูรณ์ ลองใหม่อีกครั้ง", code: "bad_json" });
    res.status(err.code === "config_missing" ? 500 : 502).json({ success: false, error: err.message, code: err.code });
  }
});

const saveSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(), slot: z.string().optional(), meal: z.string().optional(),
  foodName: z.string().min(1).optional(), name: z.string().min(1).optional(), calories: z.number().nonnegative().optional(), kcal: z.number().nonnegative().optional(),
  protein: z.number().nonnegative().default(0), carbs: z.number().nonnegative().optional(), carb: z.number().nonnegative().optional(), fat: z.number().nonnegative().default(0), sodium: z.number().nonnegative().default(0), fiber: z.number().nonnegative().default(0),
  photoUrl: z.string().optional().nullable(), source: z.enum(["manual", "vision", "nlp", "barcode"]).default("vision"), description: z.string().optional()
});
function normalizeMeal(value?: string) { const v = (value ?? "").trim().toLowerCase(); if (["breakfast", "เช้า", "มื้อเช้า"].includes(v)) return "breakfast" as const; if (["lunch", "กลางวัน", "มื้อกลางวัน"].includes(v)) return "lunch" as const; if (["dinner", "เย็น", "มื้อเย็น"].includes(v)) return "dinner" as const; if (["snack", "ของว่าง"].includes(v)) return "snack" as const; return null; }
scanRouter.post("/save", (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  const d = parsed.data;
  const mealType = d.mealType ?? normalizeMeal(d.slot) ?? normalizeMeal(d.meal) ?? "snack";
  const foodName = d.foodName ?? d.name;
  const calories = d.calories ?? d.kcal;
  const carbs = d.carbs ?? d.carb ?? 0;
  if (!foodName) return res.status(400).json({ success: false, error: "ไม่พบชื่อเมนูอาหาร", code: "food_name_missing" });
  if (calories === undefined) return res.status(400).json({ success: false, error: "ไม่พบจำนวนแคลอรี", code: "calories_missing" });
  const stmt = db.prepare(`INSERT INTO food_entries (user_id, meal_type, food_name, calories, protein, carbs, fat, sodium, fiber, photo_url, source) VALUES (@userId, @mealType, @foodName, @calories, @protein, @carbs, @fat, @sodium, @fiber, @photoUrl, @source)`);
  const info = stmt.run({ userId: req.userId, mealType, foodName, calories, protein: d.protein, carbs, fat: d.fat, sodium: d.sodium, fiber: d.fiber, photoUrl: d.photoUrl ?? null, source: d.source });
  res.status(201).json({ success: true, id: info.lastInsertRowid });
});
