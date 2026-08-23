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
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const health = await request("/api/health");
if (health.ok !== true) throw new Error(`health check failed: ${JSON.stringify(health)}`);

const registered = await request("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ name: "WK Smoke", email, password: "SmokeTest123!" }),
});
if (!registered.token) throw new Error("register did not return a session token");
if (registered.user?.email !== email) throw new Error("register returned the wrong user");

const authHeaders = { Authorization: `Bearer ${registered.token}` };
const me = await request("/api/auth/me", { headers: authHeaders });
if (me.user?.email !== email) throw new Error("auth/me returned the wrong user");

const profile = await request("/api/auth/me", {
  method: "PATCH",
  headers: authHeaders,
  body: JSON.stringify({ displayName: "WK Smoke Updated", weightKg: 70, heightCm: 175, goalKcal: 2100 }),
});
if (profile.success !== true) throw new Error("profile update failed");

const water = await request("/api/water/add", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ delta: 1 }),
});
if (water.success !== true || water.glasses !== 1) throw new Error("water update failed");

const meal = await request("/api/scan/save", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ foodName: "Smoke Meal", calories: 500, protein: 25, carbs: 55, fat: 15, source: "manual", mealType: "lunch" }),
});
if (meal.success !== true) throw new Error("food save failed");

const insight = await request("/api/insight/weekly", { headers: authHeaders });
for (const key of ["avgKcal", "avgProtein", "daysLogged", "daysOnGoal", "totalSteps", "totalWorkoutMinutes", "streakChange", "headline", "tips"]) {
  if (!(key in insight)) throw new Error(`weekly insight missing field: ${key}`);
}

const logout = await request("/api/auth/logout", {
  method: "POST",
  headers: authHeaders,
});
if (logout.success !== true) throw new Error("logout failed");

console.log("WK Health backend integration smoke: PASS");
