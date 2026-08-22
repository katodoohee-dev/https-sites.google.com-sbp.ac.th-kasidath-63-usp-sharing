export interface VisionResult {
  raw: string;
}

// Stable multimodal fallback. A production deployment can override this with GEMINI_VISION_MODEL.
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

function cleanBase64(value: string) {
  return value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
}

async function directGeminiVision(
  base64Image: string,
  mimeType: string,
  promptText: string,
  timeoutMs: number,
): Promise<VisionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error("GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน environment ของ backend"),
      { code: "config_missing" },
    );
  }

  const model = process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: cleanBase64(base64Image),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 800,
          },
        }),
        signal: controller.signal,
      },
    );

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Gemini API ตอบกลับผิดพลาด (HTTP ${response.status})`;
      throw Object.assign(new Error(message), {
        code: response.status === 429 || response.status >= 500 ? "server_transient" : "http_permanent",
        status: response.status,
      });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || "")
      .join("")
      .trim();

    if (!text) {
      throw Object.assign(new Error("Gemini API ไม่ส่งข้อความผลวิเคราะห์กลับมา"), {
        code: "bad_response",
      });
    }
    return { raw: text };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw Object.assign(new Error("Gemini Vision ไม่ตอบสนองภายในเวลาที่กำหนด (timeout)"), {
        code: "timeout",
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeFoodImage(
  base64Image: string,
  mimeType: string,
  promptText: string,
  timeoutMs = 25_000,
): Promise<VisionResult> {
  const proxyUrl = process.env.GEMINI_VISION_PROXY_URL?.trim();
  const authKey = process.env.GEMINI_WORKER_AUTH_KEY?.trim();

  // Prefer the authenticated Worker proxy when both values are configured.
  // If unavailable, fall back to the server-side Gemini key. Secrets never enter the browser bundle.
  if (proxyUrl && authKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Auth-Key": authKey,
        },
        body: JSON.stringify({ imageBase64: base64Image, mimeType, prompt: promptText }),
        signal: controller.signal,
      });

      const data: any = await response.json().catch(() => ({}));
      if (response.ok && data?.success && typeof data.result === "string") {
        return { raw: data.result };
      }
    } catch {
      // Fall through to direct Gemini API.
    } finally {
      clearTimeout(timer);
    }
  }

  return directGeminiVision(base64Image, mimeType, promptText, timeoutMs);
}
