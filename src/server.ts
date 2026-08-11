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
import { musicRouter } from "./routes/music.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" })); // รองรับ base64 image
app.use(resolveUser); // เติม req.userId ให้ทุก request (login แล้วใช้ user จริง, ไม่ login fallback 'local')

app.get("/api/health", (_req, res) => res.json({ ok: true }));
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
app.use("/api/music", musicRouter);

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`WK Health backend listening on :${port}`);
});
