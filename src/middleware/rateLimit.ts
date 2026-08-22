import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, Bucket>();
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) if (bucket.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweeper.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = hits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: "too_many_requests", code: "rate_limited" });
    }
    bucket.count += 1;
    return next();
  };
}
