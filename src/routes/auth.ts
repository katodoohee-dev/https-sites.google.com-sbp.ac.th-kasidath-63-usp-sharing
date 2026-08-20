import { Router } from "express";
import { z } from "zod";
import { createUser, findUserByEmail, verifyPassword, createSession, deleteSession } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  // Accept both the new UI's `name` and the canonical API `displayName`.
  displayName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
}).transform((value) => ({
  email: value.email,
  password: value.password,
  displayName: value.displayName ?? value.name,
}));

authRouter.post("/register", (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { email, password, displayName } = parsed.data;

  if (findUserByEmail(email)) {
    return res.status(409).json({ success: false, error: "อีเมลนี้ถูกใช้ไปแล้ว", code: "email_taken" });
  }

  const user = createUser(email, password, displayName);
  const token = createSession(user.id);
  res.status(201).json({
    success: true,
    token,
    user: { id: user.id, email: user.email, displayName: user.display_name },
  });
});

authRouter.post("/login", (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { email, password } = parsed.data;

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง", code: "invalid_credentials" });
  }

  const token = createSession(user.id);
  res.json({ success: true, token, user: { id: user.id, email: user.email, displayName: user.display_name } });
});

authRouter.post("/logout", (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (token) deleteSession(token);
  res.json({ success: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db
    .prepare(
      `SELECT id, email, display_name, weight_kg, height_cm, goal_kcal, goal_protein, goal_carb, goal_fat FROM users WHERE id = ?`
    )
    .get(req.userId);
  res.json({ success: true, user });
});

const profileSchema = z.object({
  displayName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  goalKcal: z.number().int().positive().optional(),
  goalProtein: z.number().nonnegative().optional(),
  goalCarb: z.number().nonnegative().optional(),
  goalFat: z.number().nonnegative().optional(),
}).transform((value) => ({
  ...value,
  displayName: value.displayName ?? value.name,
}));

authRouter.patch("/me", requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const d = parsed.data;
  const current = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId) as any;
  db.prepare(
    `UPDATE users SET display_name=@display_name, weight_kg=@weight_kg, height_cm=@height_cm,
     goal_kcal=@goal_kcal, goal_protein=@goal_protein, goal_carb=@goal_carb, goal_fat=@goal_fat
     WHERE id=@id`
  ).run({
    id: req.userId,
    display_name: d.displayName ?? current.display_name,
    weight_kg: d.weightKg ?? current.weight_kg,
    height_cm: d.heightCm ?? current.height_cm,
    goal_kcal: d.goalKcal ?? current.goal_kcal,
    goal_protein: d.goalProtein ?? current.goal_protein,
    goal_carb: d.goalCarb ?? current.goal_carb,
    goal_fat: d.goalFat ?? current.goal_fat,
  });
  res.json({ success: true });
});
