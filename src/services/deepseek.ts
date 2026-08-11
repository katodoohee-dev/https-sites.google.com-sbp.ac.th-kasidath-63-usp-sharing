// ย้ายมาจาก callDeepSeekOnce() ในไฟล์ frontend เดิม (บรรทัด ~2935-2955)
// proxy ตัวนี้เป็น OpenAI-compatible chat completion ผ่าน Cloudflare Worker เดิม

export async function callDeepSeek(promptText: string, maxTokens = 2000, timeoutMs = 25_000): Promise<string> {
  const proxyUrl = process.env.DEEPSEEK_PROXY_URL;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!proxyUrl) {
    throw Object.assign(new Error("DEEPSEEK_PROXY_URL ยังไม่ได้ตั้งค่าใน .env"), { code: "config_missing" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: promptText }] }),
      signal: controller.signal,
    });
  } catch (err: any) {
    const e = new Error(
      err.name === "AbortError"
        ? "เรียก DeepSeek ไม่ตอบสนองภายในเวลาที่กำหนด (timeout)"
        : "เชื่อมต่อ DeepSeek proxy ไม่ได้ (เช็คอินเทอร์เน็ต)"
    );
    (e as any).code = err.name === "AbortError" ? "timeout" : "network";
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const e = new Error(`DeepSeek proxy ตอบกลับผิดพลาด (HTTP ${response.status})`);
    (e as any).code = response.status >= 500 || response.status === 429 ? "server_transient" : "http_permanent";
    throw e;
  }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const e = new Error("DeepSeek proxy ตอบกลับไม่มีเนื้อหา");
    (e as any).code = "bad_response";
    throw e;
  }
  return content as string;
}

/** parseAiJson เดิม: AI มักตอบ JSON ห่อด้วย ```json ... ``` — แกะออกมาก่อน parse */
export function parseAiJson<T = unknown>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(cleaned) as T;
}
