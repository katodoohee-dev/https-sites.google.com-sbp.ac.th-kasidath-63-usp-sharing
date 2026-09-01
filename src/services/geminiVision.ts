// ย้ายมาจาก callGeminiVisionOnce() ในไฟล์ frontend เดิม (บรรทัด ~7067-7100)
// ต่างจากเดิมตรงที่ AUTH KEY อยู่ฝั่ง server เท่านั้น ไม่หลุดไปกับ client bundle อีกต่อไป
//
// รองรับ 2 โหมด (เช็คจาก env var ที่ตั้งไว้จริง):
//  1) Cloudflare Worker proxy: GEMINI_VISION_PROXY_URL + GEMINI_WORKER_AUTH_KEY
//  2) เรียก Google Gemini API ตรง: GEMINI_API_KEY เท่านั้น (ไม่ผ่าน Worker)

export interface VisionResult {
  raw: string;
}

const DIRECT_GEMINI_MODEL = "gemini-2.0-flash";
const DIRECT_GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${DIRECT_GEMINI_MODEL}:generateContent`;

async function analyzeFoodImageViaWorker(
  base64Image: string,
  mimeType: string,
  promptText: string,
  proxyUrl: string,
  authKey: string,
  timeoutMs: number
): Promise<VisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Auth-Key": authKey },
      body: JSON.stringify({ imageBase64: base64Image, mimeType, prompt: promptText }),
      signal: controller.signal,
    });
  } catch (err: any) {
    const e = new Error(
      err.name === "AbortError"
        ? "เรียก Gemini Vision ไม่ตอบสนองภายในเวลาที่กำหนด (timeout)"
        : "เชื่อมต่อ Gemini Vision proxy ไม่ได้ (เช็คอินเทอร์เน็ต)"
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
    const e = new Error("Gemini Vision proxy ตอบกลับมาไม่ใช่ JSON ที่อ่านได้");
    (e as any).code = "bad_response";
    throw e;
  }

  if (!response.ok || !data.success) {
    const msg = data?.error || `Gemini Vision proxy ตอบกลับผิดพลาด (HTTP ${response.status})`;
    const e = new Error(msg);
    (e as any).code = response.status >= 500 || response.status === 429 ? "server_transient" : "http_permanent";
    (e as any).status = response.status;
    throw e;
  }

  return { raw: data.result };
}

async function analyzeFoodImageViaDirectApi(
  base64Image: string,
  mimeType: string,
  promptText: string,
  apiKey: string,
  timeoutMs: number
): Promise<VisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // base64Image อาจมี data URL prefix ติดมา (data:image/jpeg;base64,....) ต้องตัดออกก่อนส่งให้ Google
  const rawBase64 = base64Image.includes(",") ? base64Image.split(",")[1]! : base64Image;

  let response: Response;
  try {
    response = await fetch(DIRECT_GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: rawBase64 } }],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    const e = new Error(
      err.name === "AbortError"
        ? "เรียก Gemini API ไม่ตอบสนองภายในเวลาที่กำหนด (timeout)"
        : "เชื่อมต่อ Gemini API ไม่ได้ (เช็คอินเทอร์เน็ต)"
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
    const e = new Error("Gemini API ตอบกลับมาไม่ใช่ JSON ที่อ่านได้");
    (e as any).code = "bad_response";
    throw e;
  }

  if (!response.ok) {
    const msg = data?.error?.message || `Gemini API ตอบกลับผิดพลาด (HTTP ${response.status})`;
    const e = new Error(msg);
    (e as any).code = response.status >= 500 || response.status === 429 ? "server_transient" : "http_permanent";
    (e as any).status = response.status;
    throw e;
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const e = new Error("Gemini API ตอบกลับไม่มีเนื้อหาที่วิเคราะห์ได้");
    (e as any).code = "bad_response";
    throw e;
  }

  return { raw: text };
}

export async function analyzeFoodImage(
  base64Image: string,
  mimeType: string,
  promptText: string,
  timeoutMs = 25_000
): Promise<VisionResult> {
  const proxyUrl = process.env.GEMINI_VISION_PROXY_URL;
  const workerAuthKey = process.env.GEMINI_WORKER_AUTH_KEY;
  const directApiKey = process.env.GEMINI_API_KEY;

  if (proxyUrl && workerAuthKey) {
    return analyzeFoodImageViaWorker(base64Image, mimeType, promptText, proxyUrl, workerAuthKey, timeoutMs);
  }
  if (directApiKey) {
    return analyzeFoodImageViaDirectApi(base64Image, mimeType, promptText, directApiKey, timeoutMs);
  }
  throw Object.assign(
    new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY (หรือ GEMINI_VISION_PROXY_URL + GEMINI_WORKER_AUTH_KEY) ใน environment variables"),
    { code: "config_missing" }
  );
}
