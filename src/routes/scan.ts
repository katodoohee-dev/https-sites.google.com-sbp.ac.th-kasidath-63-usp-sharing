import { Router } from "express";
import { z } from "zod";
import { analyzeFoodImage } from "../services/geminiVision.js";
import { callDeepSeek, parseAiJson } from "../services/deepseek.js";
import { db } from "../db/index.js";

export const scanRouter = Router();

const visionRequestSchema = z.object({
  imageBase64: z.string().min(100, "รูปภาพไม่ถูกต้องหรือว่างเปล่า"),
  mimeType: z.string().default("image/jpeg"),
});

const NutritionSchema = z.object({
  foodName: z.string(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().default(0),
  carbs: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
  sodium: z.number().nonnegative().default(0),
  fiber: z.number().nonnegative().default(0),
});

/** POST /api/scan/vision — ขั้นที่ 1: ส่งรูป → Gemini แยกวัตถุดิบ/รายการอาหารในภาพ */
scanRouter.post("/vision", async (req, res) => {
  const parsed = visionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { imageBase64, mimeType } = parsed.data;

  const prompt =
    "วิเคราะห์รูปอาหารนี้ แล้วบอกชื่อเมนู/วัตถุดิบหลักที่เห็นในภาพ ตอบสั้นกระชับเป็นภาษาไทย ไม่ต้องคำนวณแคลอรี";

  try {
    const result = await analyzeFoodImage(imageBase64, mimeType, prompt);
    res.json({ success: true, description: result.raw });
  } catch (err: any) {
    const status = err.code === "config_missing" ? 500 : err.status && err.status < 500 ? 400 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

/** POST /api/scan/calc — ขั้นที่ 2: ส่งคำอธิบายอาหาร (จากขั้น vision หรือพิมพ์เอง) → DeepSeek คำนวณแคล */
scanRouter.post("/calc", async (req, res) => {
  const bodySchema = z.object({ description: z.string().min(2) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }

  const prompt = `จากคำอธิบายอาหารนี้: "${parsed.data.description}"
ประมาณค่าโภชนาการ แล้วตอบเป็น JSON เท่านั้น (ไม่มีข้อความอื่น) รูปแบบ:
{"foodName": string, "calories": number, "protein": number, "carbs": number, "fat": number, "sodium": number, "fiber": number}`;

  try {
    const raw = await callDeepSeek(prompt, 500);
    const parsedJson = parseAiJson(raw);
    const nutrition = NutritionSchema.parse(parsedJson);
    res.json({ success: true, nutrition });
  } catch (err: any) {
    if (err instanceof SyntaxError || err?.issues) {
      return res.status(502).json({ success: false, error: "AI ตอบกลับมาเป็น JSON ที่ไม่สมบูรณ์ ลองใหม่อีกครั้ง", code: "bad_json" });
    }
    const status = err.code === "config_missing" ? 500 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

/** POST /api/scan/save — บันทึกผลลง diary หลังผู้ใช้ยืนยัน */
const saveSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  foodName: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().default(0),
  carbs: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
  sodium: z.number().nonnegative().default(0),
  fiber: z.number().nonnegative().default(0),
  photoUrl: z.string().optional(),
  source: z.enum(["manual", "vision", "nlp", "barcode"]).default("vision"),
});

scanRouter.post("/save", (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const d = { ...parsed.data, photoUrl: parsed.data.photoUrl ?? null };
  const stmt = db.prepare(
    `INSERT INTO food_entries (user_id, meal_type, food_name, calories, protein, carbs, fat, sodium, fiber, photo_url, source)
     VALUES (@userId, @mealType, @foodName, @calories, @protein, @carbs, @fat, @sodium, @fiber, @photoUrl, @source)`
  );
  const info = stmt.run({ ...d, userId: req.userId });
  res.status(201).json({ success: true, id: info.lastInsertRowid });
});
