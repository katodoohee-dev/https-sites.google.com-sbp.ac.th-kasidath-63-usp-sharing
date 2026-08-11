import type { Request, Response, NextFunction } from "express";
import { getUserBySessionToken } from "../services/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

/** ถ้ามี Bearer token ถูกต้อง ใช้ user จริง ถ้าไม่มี fallback เป็น 'local' (เพื่อ backward-compat กับกลุ่ม 2-6 ที่ทำก่อนมี auth) */
export function resolveUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    const user = getUserBySessionToken(token);
    if (user) {
      req.userId = user.id;
      return next();
    }
  }
  req.userId = "local";
  next();
}

/** ใช้กับ endpoint ที่ต้อง login จริงเท่านั้น (เช่นแก้ profile) */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const user = token ? getUserBySessionToken(token) : undefined;
  if (!user) {
    return res.status(401).json({ success: false, error: "ต้องเข้าสู่ระบบก่อน", code: "unauthorized" });
  }
  req.userId = user.id;
  next();
}
