// ผู้ช่วยแชทเรียก Gemini แค่ "ค้นข้อมูลอินเทอร์เน็ต" อย่างเดียวตามที่ขอ — งานคุย/บุคลิก/หน่วยความจำ
// บทสนทนายังเป็นหน้าที่ของ DeepSeek เหมือนเดิมทั้งหมด (ดู assistant.ts) ไฟล์นี้แค่คืน "ข้อเท็จจริงที่
// ค้นเจอจริง ณ ตอนนี้" กลับไปให้ DeepSeek เอาไปแต่งเป็นคำตอบต่อ — Gemini ไม่ได้เป็นคนคุยกับผู้ใช้เอง

export interface WebSearchResult {
  summary: string;
  sources: { title: string; uri: string }[];
}

const SEARCH_MODEL = "gemini-3.1-flash-lite";
const SEARCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${SEARCH_MODEL}:generateContent`;

/**
 * ค้นอินเทอร์เน็ตผ่าน Gemini + Google Search grounding tool (built-in ของ Gemini API เอง
 * ไม่ต้องเรียก search engine แยก) แล้วสรุปกลับมาเป็นข้อความสั้นๆ พร้อมแหล่งอ้างอิง
 * ใช้ GEMINI_API_KEY ตัวเดียวกับที่ใช้ฝั่งวิเคราะห์รูปอาหาร (geminiVision.ts) — ถ้ายังไม่ตั้งค่า
 * ให้ throw config_missing แล้วฝั่ง assistant.ts จะข้ามการค้นไปเงียบๆ ไม่ทำให้แชทพัง
 */
export async function searchWeb(query: string, timeoutMs = 12_000): Promise<WebSearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับการค้นอินเทอร์เน็ต"), {
      code: "config_missing",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    const e = new Error(
      err.name === "AbortError" ? "ค้นข้อมูลไม่ตอบสนองภายในเวลาที่กำหนด (timeout)" : "เชื่อมต่อ Gemini Search ไม่ได้"
    );
    (e as any).code = err.name === "AbortError" ? "timeout" : "network";
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error("Gemini Search ตอบกลับมาไม่ใช่ JSON ที่อ่านได้"), { code: "bad_response" });
  }

  if (!response.ok) {
    const msg = data?.error?.message || `Gemini Search ตอบกลับผิดพลาด (HTTP ${response.status})`;
    throw Object.assign(new Error(msg), {
      code: response.status >= 500 || response.status === 429 ? "server_transient" : "http_permanent",
      status: response.status,
    });
  }

  const candidate = data?.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n");
  if (!text) {
    throw Object.assign(new Error("Gemini Search ไม่พบข้อมูลที่เกี่ยวข้อง"), { code: "bad_response" });
  }

  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c: any) => ({ title: c?.web?.title as string, uri: c?.web?.uri as string }))
    .filter((s: any) => s.title && s.uri)
    .slice(0, 5);

  return { summary: text, sources };
}

/** เดาว่าข้อความน่าจะต้องใช้ข้อมูลปัจจุบัน/อินเทอร์เน็ตไหม (ข่าว, ราคา, วันที่ปัจจุบัน, ใคร/อะไร ที่ยังไม่รู้จัก ฯลฯ)
 * เป็น heuristic ง่ายๆ พอใช้ได้ ไม่ต้องแม่นยำ 100% — พลาดแล้วไม่ค้นก็แค่ตอบแบบเดิม ไม่ทำให้แชทพัง */
export function looksLikeItNeedsWebSearch(text: string): boolean {
  return /(ล่าสุด|วันนี้|ตอนนี้|เมื่อไหร่|ข่าว|ราคา|กี่บาท|อัตราแลกเปลี่ยน|หุ้น|ผลบอล|ผลแข่ง|พยากรณ์อากาศ|สภาพอากาศ|คือใคร|คืออะไร|อยู่ที่ไหน|เกิดอะไรขึ้น|ค้นหา|หาข้อมูล|search|เสิร์ช)/i.test(
    text
  );
}
