import { Router } from "express";
import { z } from "zod";
import { callDeepSeek, parseAiJson } from "../services/deepseek.js";

export const voiceRouter = Router();

const SYSTEM_PROMPT = `คุณคือผู้เชี่ยวชาญภาษาไทยและเป็น intent router ของ WK Health
ผู้ใช้สามารถพูดภาษาไทยได้ทุกสำนวน ทุกระดับความสุภาพ พูดอ้อม พูดสั้น พูดยาว มีคำฟุ่มเฟือย พูดผิดเล็กน้อย หรือใช้คำใกล้เคียงกันได้ ให้ตีความ "ความหมาย" ไม่ใช่ค้นหาคำตรง ๆ

กฎสำคัญ:
- วิเคราะห์เป็นภาษาไทยก่อนเสมอ
- ผลลัพธ์ต้องเป็น JSON array เท่านั้น ห้ามมี markdown ห้ามมีคำอธิบาย
- ถ้ามีหลายเจตนา ให้คืนหลาย action ตามลำดับที่ควรทำ
- ใช้เฉพาะ action ที่อยู่ในรายการ Allowed actions
- ถ้าไม่เกี่ยวกับการควบคุมแอป ให้คืน NONE
- ถ้าเป็นกิจกรรมออกกำลังกาย ให้คืน EXERCISE พร้อม activity, duration_min และ mets ที่สมเหตุสมผล

Allowed actions:
START_WALK,START_RUN,START_CYCLE,START_GPS,STOP_WALK,STOP_RUN,STOP_CYCLE,STOP_GPS,
PLAY_MUSIC,PAUSE_MUSIC,STOP_MUSIC,NEXT_MUSIC,PREVIOUS_MUSIC,
OPEN_MUSIC,OPEN_DIARY,OPEN_STATS,OPEN_SCAN,OPEN_BARCODE,OPEN_PEDOMETER,OPEN_ASSISTANT,OPEN_PROFILE,
EXERCISE,SHOW_CALORIES,SHOW_STEPS,SAVE_MEAL,NONE.`;

const VoiceActionSchema = z.object({ action: z.string() }).passthrough();

const bodySchema = z.object({ text: z.string().min(1) });

/** POST /api/voice/interpret — แปลงข้อความ (มาจาก speech-to-text ฝั่ง client) เป็น action list ผ่าน DeepSeek */
voiceRouter.post("/interpret", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }

  const prompt = `${SYSTEM_PROMPT}\n\nข้อความจากผู้ใช้: "${parsed.data.text}"\n\nตอบเป็น JSON array เท่านั้น`;

  try {
    const raw = await callDeepSeek(prompt, 400);
    const parsedJson = parseAiJson<unknown>(raw);
    const list = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
    const actions = list
      .map((x) => VoiceActionSchema.safeParse(x))
      .filter((r): r is { success: true; data: z.infer<typeof VoiceActionSchema> } => r.success)
      .map((r) => r.data);
    res.json({ success: true, actions });
  } catch (err: any) {
    if (err instanceof SyntaxError || err?.issues) {
      return res.status(502).json({ success: false, error: "AI ตอบกลับมาเป็น JSON ที่ไม่สมบูรณ์ ลองใหม่อีกครั้ง", code: "bad_json" });
    }
    const status = err.code === "config_missing" ? 500 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});
