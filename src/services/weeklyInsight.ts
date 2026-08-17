import { db } from "../db/index.js";

export interface WeeklyInsight {
  avgKcal: number;
  avgProtein: number;
  daysLogged: number;
  daysOnGoal: number;
  bestDay: { date: string; kcal: number } | null;
  totalSteps: number;
  totalWorkoutMinutes: number;
  streakChange: number;
  headline: string;
  tips: string[];
}

/** สร้าง insight รายสัปดาห์จากข้อมูลจริงในระบบล้วนๆ (คำนวณ ไม่ใช่ให้ AI เดา — แม่นยำและไม่มีค่าใช้จ่าย API) */
export function buildWeeklyInsight(userId: string): WeeklyInsight {
  const foodDays = db
    .prepare(
      `SELECT date(created_at) AS day, SUM(calories) AS kcal, SUM(protein) AS protein
       FROM food_entries WHERE user_id = ? AND created_at >= datetime('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all(userId) as { day: string; kcal: number; protein: number }[];

  const user = db.prepare(`SELECT goal_kcal FROM users WHERE id = ?`).get(userId) as
    | { goal_kcal: number }
    | undefined;
  const goalKcal = user?.goal_kcal ?? 2000;

  const daysLogged = foodDays.length;
  const avgKcal = daysLogged ? Math.round(foodDays.reduce((s, d) => s + d.kcal, 0) / daysLogged) : 0;
  const avgProtein = daysLogged ? Math.round(foodDays.reduce((s, d) => s + (d.protein || 0), 0) / daysLogged) : 0;
  const daysOnGoal = foodDays.filter((d) => Math.abs(d.kcal - goalKcal) <= goalKcal * 0.15).length;

  const bestDay = foodDays.length
    ? foodDays.reduce((best, d) => (Math.abs(d.kcal - goalKcal) < Math.abs(best.kcal - goalKcal) ? d : best))
    : null;

  const steps = db
    .prepare(
      `SELECT COALESCE(SUM(steps),0) AS total FROM steps_daily WHERE user_id = ? AND day >= date('now', '-6 days')`
    )
    .get(userId) as { total: number };

  const workout = db
    .prepare(
      `SELECT COALESCE(SUM(minutes),0) AS total FROM workouts WHERE user_id = ? AND created_at >= datetime('now', '-6 days')`
    )
    .get(userId) as { total: number };

  const checkin = db.prepare(`SELECT streak FROM checkins WHERE user_id = ?`).get(userId) as
    | { streak: number }
    | undefined;

  const tips: string[] = [];
  if (daysLogged < 4) tips.push("บันทึกมื้ออาหารให้ครบทุกวันจะช่วยให้เห็นภาพรวมชัดขึ้น");
  if (avgProtein < 80) tips.push("สัปดาห์นี้โปรตีนเฉลี่ยค่อนข้างต่ำ ลองเพิ่มไข่ อกไก่ หรือเต้าหู้ในมื้อถัดไป");
  if (steps.total < 35_000) tips.push("ก้าวเดินรวมสัปดาห์นี้ยังไม่ถึง 5,000 ก้าว/วันโดยเฉลี่ย ลองเดินเพิ่มวันละนิด");
  if (workout.total === 0) tips.push("สัปดาห์นี้ยังไม่มีการออกกำลังกายเลย ลองเริ่มจาก 15 นาที/วันดูก่อน");
  if (tips.length === 0) tips.push("ทำได้ดีมากในสัปดาห์นี้ รักษาจังหวะนี้ต่อไปนะครับ");

  const headline =
    daysLogged === 0
      ? "สัปดาห์นี้ยังไม่มีการบันทึกมื้ออาหารเลย เริ่มบันทึกมื้อแรกกันเถอะ"
      : daysOnGoal >= 5
        ? `สัปดาห์นี้คุมแคลได้ดีเยี่ยม ${daysOnGoal}/7 วันอยู่ในเป้าหมาย`
        : `สัปดาห์นี้เฉลี่ย ${avgKcal} kcal/วัน (เป้าหมาย ${goalKcal} kcal)`;

  return {
    avgKcal,
    avgProtein,
    daysLogged,
    daysOnGoal,
    bestDay: bestDay ? { date: bestDay.day, kcal: bestDay.kcal } : null,
    totalSteps: steps.total,
    totalWorkoutMinutes: workout.total,
    streakChange: checkin?.streak ?? 0,
    headline,
    tips,
  };
}
