// ย้ายมาจาก callGeminiVisionOnce() ในไฟล์ frontend เดิม (บรรทัด ~7067-7100)
// ต่างจากเดิมตรงที่ AUTH KEY อยู่ฝั่ง server เท่านั้น ไม่หลุดไปกับ client bundle อีกต่อไป

export interface VisionResult {
  raw: string;
}

export async function analyzeFoodImage(
  base64Image: string,
  mimeType: string,
  promptText: string,
  timeoutMs = 25_000
): Promise<VisionResult> {
  const proxyUrl = process.env.GEMINI_VISION_PROXY_URL;
  const authKey = process.env.GEMINI_WORKER_AUTH_KEY;
  if (!proxyUrl || !authKey) {
    throw Object.assign(new Error("GEMINI_VISION_PROXY_URL / GEMINI_WORKER_AUTH_KEY ยังไม่ได้ตั้งค่าใน .env"), {
      code: "config_missing",
    });
  }

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
