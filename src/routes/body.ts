import { Router } from "express";
import { z } from "zod";
import { calcBMI, classifyBMI } from "../services/bodyMetrics.js";

export const bodyRouter = Router();

/** GET /api/body/bmi?weightKg=65&heightCm=170 */
bodyRouter.get("/bmi", (req, res) => {
  const schema = z.object({
    weightKg: z.coerce.number().positive(),
    heightCm: z.coerce.number().positive(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message });
  const bmi = calcBMI(parsed.data.weightKg, parsed.data.heightCm);
  res.json({ success: true, bmi: bmi ? Math.round(bmi * 10) / 10 : null, classification: classifyBMI(bmi) });
});
