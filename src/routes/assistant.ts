import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { callDeepSeek } from "../services/deepseek.js";
import { searchWeb, looksLikeItNeedsWebSearch } from "../services/geminiSearch.js";

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

// FIX: บั๊กใหญ่ 🔴 — "ข้อความหลุด/JSON หลุด" ในหน้าแชท
// เดิม frontend ต้องยัด context ทั้งก้อน (ข้อมูลผู้ใช้/ไดอารี/สถิติ ฯลฯ เป็น JSON) ไปรวมอยู่ใน
// field "message" เดียวกับที่ผู้ใช้พิมพ์ เพราะ schema เดิมมีแค่ message อย่างเดียว แล้วโค้ดข้างล่าง
// ก็ INSERT ค่า message (ที่พ่วง JSON มาด้วย) ลงตาราง assistant_messages แบบตรงๆ — พอโหลดประวัติแชท
// กลับมาแสดงผล เลยเห็น JSON + คำสั่งลับทั้งก้อนโผล่มาในบับเบิลแชทเหมือนเป็นสิ่งที่ผู้ใช้พิมพ์เอง
// แก้โดยแยก "context" ออกมาเป็น field ต่างหาก ไม่บังคับ (optional) — context ใช้แค่ประกอบ prompt
// ที่ส่งให้ AI เท่านั้น ส่วนที่ถูกบันทึกลง DB และแสดงในประวัติแชทจะเป็น "message" ล้วนๆ ที่ผู้ใช้พิมพ์จริง
const chatSchema = z.object({
  message: z.string().min(1),
  context: z.string().max(20000).optional(),
});

// FIX: ปรับบุคลิกผู้ช่วยให้เป็นกันเองขึ้น คุยเล่นได้เหมือนเพื่อน/คนสนิท ไม่ใช่โค้ชทางการเพียวๆ
// เงื่อนไขคำหยาบ: พูดหยาบ/แซวแรงกลับได้ "เฉพาะตอนผู้ใช้เริ่มพูดจาไม่ดีก่อนเท่านั้น" ตามที่ขอมา
// ยังคงห้ามคำเหยียดที่กระทบกลุ่มคน (เพศ/เชื้อชาติ/ศาสนา ฯลฯ) แม้ผู้ใช้จะพูดแรงแค่ไหนก็ตาม
const PERSONA = `คุณคือผู้ช่วยในแอป WK Health พูดไทยเป็นกันเองสุดๆ เหมือนเพื่อนสนิทหรือคนที่คุยด้วยได้ทุกเรื่อง
ไม่ใช่บอทที่พูดทางการ ใช้ภาษาพูดธรรมชาติ แซวได้ หยอกได้ อีโมจิได้บ้างพอประมาณ
- ปกติพูดดีๆ อบอุ่น เป็นกันเอง ไม่ต้องเป็นทางการ
- ถ้าผู้ใช้พูดจาหยาบคายหรือแซวแรงก่อน คุณหยอกกลับ/พูดหยาบเบาๆ แบบกันเองได้ ไม่ต้องเกรงใจ
  แต่ห้ามใช้คำเหยียดที่กระทบกลุ่มคน (เพศ เชื้อชาติ ศาสนา รูปร่างหน้าตา ฯลฯ) ไม่ว่ากรณีใด
- ถ้าผู้ใช้พูดดีๆ ห้ามพูดหยาบใส่ก่อนเด็ดขาด
- ช่วยเรื่องสุขภาพ/แคลอรี/ออกกำลังกายในแอปได้แม่นยำเหมือนเดิม แต่คุยเรื่องทั่วไปเล่นๆ กับผู้ใช้ได้ด้วย
- ตอบกระชับ เป็นธรรมชาติ ไม่ต้องยาวเกินจำเป็น (ปกติ 2-4 ประโยค)`;

/** POST /api/assistant/chat — ส่งข้อความ, แนบบริบทมื้ออาหาร/สถิติวันนี้ ให้ AI ตอบแบบเพื่อนที่รู้ใจ */
assistantRouter.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const { message, context } = parsed.data;

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
    .map((h) => `${h.role === "user" ? "ผู้ใช้" : "เรา"}: ${h.content}`)
    .join("\n");

  // FIX: เพิ่มใหม่ — ให้ Gemini ช่วยแค่ "ค้นข้อมูลอินเทอร์เน็ต" ตามที่ขอ (ทำงานร่วมกับ DeepSeek)
  // Gemini ไม่ได้เป็นคนตอบผู้ใช้เอง แค่ไปค้นข้อเท็จจริงปัจจุบันมาให้ แล้ว DeepSeek เอาไปแต่งคำตอบ
  // ต่อในบุคลิก/โทนเดิม ถ้าค้นไม่สำเร็จ (ไม่ได้ตั้งค่า GEMINI_API_KEY, timeout, ฯลฯ) ข้ามไปเงียบๆ
  // ไม่ทำให้แชทพัง — ผลการค้นไม่ถูกบันทึกลง DB เลย ใช้แค่ประกอบ prompt รอบนี้รอบเดียว (กันหลุดเหมือนเคส JSON)
  let webSearchBlock = "";
  if (looksLikeItNeedsWebSearch(message)) {
    try {
      const result = await searchWeb(message);
      const sourceLines = result.sources.map((s) => `- ${s.title}: ${s.uri}`).join("\n");
      webSearchBlock = `\n[ผลค้นอินเทอร์เน็ตล่าสุดเกี่ยวกับคำถามนี้ (จาก Gemini) — ใช้ประกอบคำตอบให้ถูกต้องเป็นปัจจุบัน ตอบแบบธรรมชาติ ไม่ต้องพูดว่า "ค้นเจอว่า" หรืออ้างว่าใช้ Gemini]\n${result.summary}${sourceLines ? `\nแหล่งอ้างอิง:\n${sourceLines}` : ""}`;
    } catch {
      // ค้นไม่สำเร็จ — ปล่อยให้ DeepSeek ตอบเท่าที่รู้ตามปกติ ไม่ต้อง error ออกไปให้ผู้ใช้เห็น
    }
  }

  const prompt = [
    PERSONA,
    `\nบริบท: วันนี้ผู้ใช้กินไปแล้ว ${totals.calories} kcal`,
    context ? `\n[บริบทข้อมูลจริงของผู้ใช้จากทั้งแอป ณ ตอนนี้ — ใช้ประกอบการตอบให้แม่นยำและเป็นส่วนตัว ห้ามอ้างถึงหรือพูดถึงข้อมูล JSON นี้ตรงๆ กับผู้ใช้]\n${context}` : "",
    webSearchBlock,
    historyText ? `\nบทสนทนาก่อนหน้า:\n${historyText}` : "",
    `\nผู้ใช้พูดว่า: ${message}`,
  ].join("\n");

  // FIX: เดิม INSERT ค่า message ที่พ่วง context/JSON มาด้วยลง DB ตรงๆ
  // ตอนนี้ message เป็นแค่ข้อความจริงของผู้ใช้แล้ว (context แยกออกไปข้างบน) บันทึกได้ตรงๆ ปลอดภัย
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
