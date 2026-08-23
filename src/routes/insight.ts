import { Router } from "express";
import { buildWeeklyInsight } from "../services/weeklyInsight.js";

export const insightRouter = Router();

/** GET /api/insight/weekly */
insightRouter.get("/weekly", (req, res) => {
  res.json(buildWeeklyInsight(req.userId));
});
