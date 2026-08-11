import { Router } from "express";
import { z } from "zod";
import { callDeepSeek, parseAiJson } from "../services/deepseek.js";

export const nlpRouter = Router();

const NutritionSchema = z.object({
  foodName: z.string(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().default(0),
  carbs: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
});

/** POST /api/nlp/analyze — พิมพ์บรรยายอาหารแทนการสแกน (เทียบ parseLocalNlp/nlpPrompt เดิม) */
nlpRouter.post("/analyze", async (req, res) => {
  const bodySchema = z.object({ text: z.string().min(2) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }

  const prompt = `แยกรายการอาหารและปริมาณจากข้อความนี้ (ภาษาไทยบางครั้งพิมพ์ตัวเลขเป็นคำ เช่น "สอง" = 2): "${parsed.data.text}"
ตอบเป็น JSON array เท่านั้น แต่ละรายการรูปแบบ:
{"foodName": string, "calories": number, "protein": number, "carbs": number, "fat": number}`;

  try {
    const raw = await callDeepSeek(prompt, 700);
    const parsedJson = parseAiJson<unknown[]>(raw);
    const items = z.array(NutritionSchema).parse(parsedJson);
    res.json({ success: true, items });
  } catch (err: any) {
    if (err instanceof SyntaxError || err?.issues) {
      return res.status(502).json({ success: false, error: "AI ตอบกลับมาเป็น JSON ที่ไม่สมบูรณ์ ลองใหม่อีกครั้ง", code: "bad_json" });
    }
    const status = err.code === "config_missing" ? 500 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});
