import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "../db/index.js";

const SESSION_TTL_DAYS = 30;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function createUser(email: string, password: string, displayName?: string) {
  const id = crypto.randomUUID();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedDisplayName = displayName?.trim() || null;
  const passwordHash = hashPassword(password);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)`
  ).run(id, normalizedEmail, passwordHash, normalizedDisplayName);
  return { id, email: normalizedEmail, display_name: normalizedDisplayName };
}

export function findUserByEmail(email: string) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim()) as
    | { id: string; email: string; password_hash: string; display_name: string | null }
    | undefined;
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    expiresAt
  );
  return token;
}

export function getUserBySessionToken(token: string) {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as
    | { id: string; email: string; display_name: string | null }
    | undefined;
  return row;
}

export function deleteSession(token: string) {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}
