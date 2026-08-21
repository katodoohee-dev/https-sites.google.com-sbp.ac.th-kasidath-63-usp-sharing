const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8787";
const email = `smoke-${Date.now()}@example.com`;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const health = await request("/api/health");
if (health.ok !== true) throw new Error(`health check failed: ${JSON.stringify(health)}`);
await request("/healthz");
await request("/api/health/overview");

const corsPreflight = await fetch(`${base}/api/auth/register`, {
  method: "OPTIONS",
  headers: { Origin: "https://wk-health-frontend.onrender.com", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" },
});
if (!corsPreflight.ok) throw new Error(`CORS preflight failed: ${corsPreflight.status}`);

const registered = await request("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ name: "WK Smoke", email, password: "SmokeTest123!" }),
});
if (!registered.token) throw new Error("register did not return a session token");
if (registered.user?.email !== email) throw new Error("register returned the wrong user");

const authHeaders = { Authorization: `Bearer ${registered.token}` };
const me = await request("/api/auth/me", { headers: authHeaders });
if (me.user?.email !== email) throw new Error("auth/me returned the wrong user");
await request("/api/auth/me", { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "WK Smoke Updated", weightKg: 70, heightCm: 175, goalKcal: 2100 }) });

const water = await request("/api/water/add", { method: "POST", headers: authHeaders, body: JSON.stringify({ delta: 1 }) });
if (water.success !== true || water.glasses !== 1) throw new Error("water update failed");
await request("/api/water", { method: "POST", headers: authHeaders, body: JSON.stringify({ glasses: 2 }) });

const meal = await request("/api/scan/save", { method: "POST", headers: authHeaders, body: JSON.stringify({ foodName: "Smoke Meal", calories: 500, protein: 25, carbs: 55, fat: 15, source: "manual", mealType: "lunch" }) });
if (meal.success !== true) throw new Error("food save failed");
await request("/api/diary?date=" + new Date().toISOString().slice(0,10), { headers: authHeaders });
await request("/api/stats/today", { headers: authHeaders });
await request("/api/stats/weekly", { headers: authHeaders });
await request("/api/stats/week-summary", { headers: authHeaders });
await request("/api/insight/weekly", { headers: authHeaders });
await request("/api/checkin/today", { headers: authHeaders });
await request("/api/pedometer", { headers: authHeaders });
await request("/api/mood/list", { headers: authHeaders });
await request("/api/mood/recommend?mood=calm&meal=main", { headers: authHeaders });
await request("/api/nlp/analyze", { method: "POST", headers: authHeaders, body: JSON.stringify({ text: "ข้าวไก่" }) });
await request("/api/budget/plan", { method: "POST", headers: authHeaders, body: JSON.stringify({ monthlyBudget: 5000, conditions: [], allergies: [], days: 2 }) });
await request("/api/workout", { headers: authHeaders });
await request("/api/route/history", { headers: authHeaders });
await request("/api/assistant/history", { headers: authHeaders });
await request("/api/barcode/0000000000000", { headers: authHeaders }).catch((e) => { if (!String(e.message).includes("-> 404") && !String(e.message).includes("-> 502")) throw e; });

const music = await request("/api/music", { method: "POST", headers: authHeaders, body: JSON.stringify({ url: "https://example.com/track.mp3", title: "Contract Track", type: "audio" }) });
await request("/api/music", { headers: authHeaders });
if (music.id) await request(`/api/music/${music.id}`, { method: "DELETE", headers: authHeaders });

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const gallery = await request("/api/gallery/upload", { method: "POST", headers: authHeaders, body: JSON.stringify({ imageBase64: pixel, mimeType: "image/png", filename: "contract.png" }) });
await request("/api/gallery", { headers: authHeaders });
if (gallery.media?.id) { await request(`/api/gallery/${gallery.media.id}`, { headers: authHeaders }); await request(`/api/gallery/${gallery.media.id}`, { method: "DELETE", headers: authHeaders }); }

const device = await request("/api/devices", { method: "POST", headers: authHeaders, body: JSON.stringify({ name: "Contract Watch", deviceType: "wearable" }) });
await request("/api/devices", { headers: authHeaders });
if (device.device?.id) { await request(`/api/devices/${device.device.id}/sync`, { method: "POST", headers: authHeaders }); await request(`/api/devices/${device.device.id}/disconnect`, { method: "POST", headers: authHeaders }); await request(`/api/devices/${device.device.id}`, { method: "DELETE", headers: authHeaders }); }
const connected = await request("/api/devices/connect", { method: "POST", headers: authHeaders, body: JSON.stringify({ name: "Contract Watch 2", kind: "wearable" }) });
if (connected.id) await request(`/api/devices/${connected.id}/disconnect`, { method: "POST", headers: authHeaders });

await request("/api/sound", { headers: authHeaders });
await request("/api/sound", { method: "PUT", headers: authHeaders, body: JSON.stringify({ volume: 70, mode: "focus", voiceEnabled: true }) });
await request("/api/notifications", { headers: authHeaders });
await request("/api/notifications/settings", { headers: authHeaders });
await request("/api/notifications/settings", { method: "PATCH", headers: authHeaders, body: JSON.stringify({ smartTiming: true }) });
await request("/api/friends", { headers: authHeaders });
await request("/api/friends/invite-code", { headers: authHeaders });
await request("/api/friends/location/status", { headers: authHeaders });
await request("/api/friends/location/share", { method: "POST", headers: authHeaders, body: JSON.stringify({ enabled: true }) });
await request("/api/friends/location/publish", { method: "POST", headers: authHeaders, body: JSON.stringify({ friendId: "none", lat: 13.7563, lng: 100.5018, accuracy: 10, heading: 90, speedMps: 1.2 }) });
await request("/api/export/history", { headers: authHeaders });
await request("/api/auth/logout", { method: "POST", headers: authHeaders });

console.log("WK Health backend integration smoke: PASS");
