import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { callDeepSeek } from "../services/deepseek.js";

export const assistantRouter = Router();

/** GET /api/assistant/history?limit=50 */
assistantRouter.get("/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db
    .prepare(
      `SELECT role, content, created_at FROM assistant_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(req.userId, limit);
  res.json({ success: true, messages: rows });
});

const chatSchema = z.object({ message: z.string().min(1) });

/** POST /api/assistant/chat — ส่งข้อความ, แนบบริบทมื้ออาหาร/สถิติวันนี้ ให้ AI ตอบแบบโค้ชสุขภาพ */
assistantRouter.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const { message } = parsed.data;

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(calories),0) AS calories FROM food_entries
       WHERE user_id = ? AND date(created_at) = date('now')`
    )
    .get(req.userId) as { calories: number };

  const history = db
    .prepare(`SELECT role, content FROM assistant_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`)
    .all(req.userId) as { role: string; content: string }[];
  const historyText = history
    .reverse()
    .map((h) => `${h.role === "user" ? "ผู้ใช้" : "โค้ช"}: ${h.content}`)
    .join("\n");

  const prompt = `คุณเป็นโค้ชสุขภาพในแอป WK Health App ตอบเป็นภาษาไทย กระชับ เป็นกันเอง
บริบท: วันนี้ผู้ใช้กินไปแล้ว ${totals.calories} kcal
${historyText ? `บทสนทนาก่อนหน้า:\n${historyText}\n` : ""}
ผู้ใช้ถาม: ${message}
ตอบสั้นกระชับ ไม่เกิน 3-4 ประโยค`;

  db.prepare(`INSERT INTO assistant_messages (user_id, role, content) VALUES (?, 'user', ?)`).run(
    req.userId,
    message
  );

  try {
    const reply = await callDeepSeek(prompt, 500);
    db.prepare(`INSERT INTO assistant_messages (user_id, role, content) VALUES (?, 'assistant', ?)`).run(
      req.userId,
      reply
    );
    res.json({ success: true, reply });
  } catch (err: any) {
    const status = err.code === "config_missing" ? 500 : 502;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});
