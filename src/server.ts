import "dotenv/config";
import express from "express";
import cors from "cors";
import { scanRouter } from "./routes/scan.js";
import { diaryRouter, statsRouter } from "./routes/diaryStats.js";
import { nlpRouter } from "./routes/nlp.js";
import { moodRouter, budgetRouter } from "./routes/moodBudget.js";
import { pedometerRouter } from "./routes/pedometer.js";
import { authRouter } from "./routes/auth.js";
import { resolveUser } from "./middleware/auth.js";
import { bodyRouter } from "./routes/body.js";
import { workoutRouter } from "./routes/workout.js";
import { routeRouter } from "./routes/route.js";
import { assistantRouter } from "./routes/assistant.js";
import { barcodeRouter } from "./routes/barcode.js";
import { checkinRouter } from "./routes/checkin.js";
import { musicRouter } from "./routes/music.js";
import { galleryRouter } from "./routes/gallery.js";
import { exportRouter } from "./routes/export.js";
import { friendsRouter, weekSummaryRouter } from "./routes/friends.js";
import { notificationsRouter, vapidConfigured } from "./routes/notifications.js";
import { waterRouter } from "./routes/water.js";
import { insightRouter } from "./routes/insight.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";

const app = express();
const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, "");
const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

// Keep explicit production origins, while allowing Render's generated frontend
// hostname without requiring a manual backend redeploy whenever the frontend
// service URL changes. CORS_ORIGINS remains the preferred strict allow-list for
// custom domains.
const defaultOrigins = [
  "https://wk-health-frontend.onrender.com",
  "https://sites.google.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && url.hostname.endsWith(".onrender.com");
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error("CORS origin not allowed"));
  },
  credentials: false,
}));
app.options("*", cors({ origin(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(new Error("CORS origin not allowed"));
} }));
app.use(express.json({ limit: "15mb" }));
app.use(resolveUser);

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const line = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`;
    if (res.statusCode >= 400) console.error(line, "body:", JSON.stringify(req.body));
    else console.log(line);
  });
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "wk-health-backend", version: "1.0.0" }));
app.use("/api/auth", authRouter);
app.use("/api/scan", scanRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/stats", statsRouter);
app.use("/api/nlp", nlpRouter);
app.use("/api/mood", moodRouter);
app.use("/api/budget", budgetRouter);
app.use("/api/pedometer", pedometerRouter);
app.use("/api/body", bodyRouter);
app.use("/api/workout", workoutRouter);
app.use("/api/route", routeRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/barcode", barcodeRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/music", musicRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/export", exportRouter);
app.use("/api/friends", friendsRouter);
app.use("/api/stats", weekSummaryRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/water", waterRouter);
app.use("/api/insight", insightRouter);
app.use("/uploads", express.static("data/uploads"));
app.use("/exports", express.static("data/exports"));

app.use((req, res) => {
  console.error(`404 ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: "not_found" });
});
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`UNHANDLED ERROR ${req.method} ${req.originalUrl}:`, err?.stack || err);
  if (res.headersSent) return;
  if (err?.message === "CORS origin not allowed") return res.status(403).json({ success: false, error: "cors_not_allowed" });
  res.status(500).json({ success: false, error: "internal_server_error" });
});
process.on("unhandledRejection", (reason) => console.error("UNHANDLED REJECTION:", reason));
process.on("uncaughtException", (err) => console.error("UNCAUGHT EXCEPTION:", err));

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`WK Health backend listening on :${port}`);
  console.log(`CORS allowlist: ${[...allowedOrigins].join(", ")} + *.onrender.com`);
  startReminderScheduler(vapidConfigured);
});
