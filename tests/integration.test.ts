import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const port = 8799;
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;
let tempDir = "";
let token = "";

async function waitForHealth(timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Backend did not become healthy in time");
}

async function json(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${pathname}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

describe("WK Health production integration", () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "wk-health-it-"));
    server = spawn(process.execPath, ["dist/server.js"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: path.join(tempDir, "integration.sqlite"),
        CORS_ORIGINS: "http://localhost:5173",
      },
      stdio: "ignore",
    });
    await waitForHealth();
  }, 20_000);

  afterAll(() => {
    server?.kill("SIGTERM");
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("completes auth -> profile -> water -> food -> insight -> logout", async () => {
    const email = `integration-${Date.now()}@example.com`;

    const register = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Integration User", email, password: "StrongPass123!" }),
    });
    expect(register.res.status).toBe(201);
    expect(register.body.success).toBe(true);
    expect(typeof register.body.token).toBe("string");
    token = register.body.token;

    const me = await json("/api/auth/me");
    expect(me.res.ok).toBe(true);
    expect(me.body.user.email).toBe(email);

    const profile = await json("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated User", weightKg: 68, heightCm: 174, goalKcal: 2100 }),
    });
    expect(profile.res.ok).toBe(true);

    const water = await json("/api/water/add", {
      method: "POST",
      body: JSON.stringify({ delta: 2 }),
    });
    expect(water.res.ok).toBe(true);
    expect(water.body.glasses).toBe(2);

    const food = await json("/api/scan/save", {
      method: "POST",
      body: JSON.stringify({
        mealType: "lunch",
        foodName: "ข้าวผัด",
        calories: 550,
        protein: 20,
        carbs: 75,
        fat: 18,
        source: "manual",
      }),
    });
    expect(food.res.status).toBe(201);
    expect(food.body.success).toBe(true);

    const insight = await json("/api/insight/weekly");
    expect(insight.res.ok).toBe(true);
    expect(insight.body).toHaveProperty("headline");
    expect(insight.body).toHaveProperty("daysLogged");

    const logout = await json("/api/auth/logout", { method: "POST" });
    expect(logout.res.ok).toBe(true);

    const protectedAfterLogout = await json("/api/auth/me");
    expect(protectedAfterLogout.res.status).toBe(401);
  });

  it("never exposes a secret through health details", async () => {
    const res = await fetch(`${base}/api/health/details`);
    const text = await res.text();
    expect(res.ok).toBe(true);
    expect(text).not.toMatch(/GEMINI_API_KEY|GEMINI_WORKER_AUTH_KEY|DEEPSEEK_PROXY_URL/);
  });
});
