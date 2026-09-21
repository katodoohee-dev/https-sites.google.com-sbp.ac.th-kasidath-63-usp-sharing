import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { haversineKm, estimateKcalBurned } from "../services/pedometer.js";

export const routeRouter = Router();

const pointSchema = z.object({ lat: z.number(), lng: z.number(), t: z.number().optional() });

/** POST /api/route/start — เริ่มบันทึกเส้นทาง คืน routeId ให้ client เก็บไว้ */
routeRouter.post("/start", (req, res) => {
  const info = db
    .prepare(`INSERT INTO gps_routes (user_id, started_at) VALUES (?, datetime('now'))`)
    .run(req.userId);
  res.status(201).json({ success: true, routeId: info.lastInsertRowid });
});

const stopSchema = z.object({
  routeId: z.number().int().positive(),
  path: z.array(pointSchema).min(2, "ต้องมีอย่างน้อย 2 จุดพิกัดเพื่อคำนวณระยะทาง"),
  durationSeconds: z.number().int().nonnegative(),
  weightKg: z.number().positive().optional(),
});

/** POST /api/route/stop — จบการบันทึก คำนวณระยะทางจาก path จริง (haversine) แล้วเก็บผล */
routeRouter.post("/stop", (req, res) => {
  const parsed = stopSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const { routeId, path, durationSeconds, weightKg } = parsed.data;

  const owned = db
    .prepare(`SELECT id FROM gps_routes WHERE id = ? AND user_id = ?`)
    .get(routeId, req.userId);
  if (!owned) return res.status(404).json({ success: false, error: "ไม่พบเส้นทางนี้ หรือไม่ใช่ของคุณ" });

  let distanceKm = 0;
  for (let i = 1; i < path.length; i++) {
    distanceKm += haversineKm(path[i - 1], path[i]);
  }
  const kcalBurned = estimateKcalBurned(distanceKm, durationSeconds, weightKg ?? 65);

  db.prepare(
    `UPDATE gps_routes SET distance_km = ?, duration_seconds = ?, kcal_burned = ?, path_json = ?, ended_at = datetime('now') WHERE id = ?`
  ).run(distanceKm, durationSeconds, kcalBurned, JSON.stringify(path), routeId);

  res.json({ success: true, distanceKm: Math.round(distanceKm * 100) / 100, kcalBurned });
});

/** GET /api/route/history?limit=10 */
routeRouter.get("/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const rows = db
    .prepare(
      `SELECT id, distance_km, duration_seconds, kcal_burned, started_at, ended_at
       FROM gps_routes WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?`
    )
    .all(req.userId, limit);
  res.json({ success: true, routes: rows });
});

// FIX: เพิ่มใหม่ — ตามที่ขอ "แชร์สถิติการวิ่งพร้อมเส้นทางจริง" ต้องมีพิกัด GPS ทั้งเส้นทาง แต่
// GET /history เดิมไม่ได้ select path_json ออกมาด้วย (กันก้อน response หน้ารายการใหญ่เกินจำเป็น)
// เลยเพิ่ม endpoint แยกไว้ ให้ frontend เรียกทีเดียวตอนจะแชร์เส้นทางไหนโดยเฉพาะเท่านั้น
routeRouter.get("/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, distance_km, duration_seconds, kcal_burned, started_at, ended_at, path_json
       FROM gps_routes WHERE id = ? AND user_id = ? AND ended_at IS NOT NULL`
    )
    .get(req.params.id, req.userId) as any;
  if (!row) return res.status(404).json({ success: false, error: "ไม่พบเส้นทางนี้ หรือไม่ใช่ของคุณ" });
  let path: { lat: number; lng: number; t?: number }[] = [];
  try {
    path = row.path_json ? JSON.parse(row.path_json) : [];
  } catch {
    path = [];
  }
  res.json({
    success: true,
    route: {
      id: row.id,
      distance_km: row.distance_km,
      duration_seconds: row.duration_seconds,
      kcal_burned: row.kcal_burned,
      started_at: row.started_at,
      ended_at: row.ended_at,
      path,
    },
  });
});
