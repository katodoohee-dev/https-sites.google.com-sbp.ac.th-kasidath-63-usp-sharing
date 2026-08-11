// ย้ายจาก calcBMI/classifyBMI/estimateExerciseKcal ในไฟล์เดิม (บรรทัด ~5577-5590, ~8622-8628)

export function calcBMI(weightKg: number, heightCm: number): number | null {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function classifyBMI(bmi: number | null): { label: string; cls: string } {
  if (bmi == null) return { label: "—", cls: "" };
  if (bmi < 18.5) return { label: "ผอมกว่าเกณฑ์", cls: "bmi-under" };
  if (bmi < 23) return { label: "สมส่วน", cls: "bmi-normal" };
  if (bmi < 25) return { label: "ท้วม", cls: "bmi-over" };
  return { label: "อ้วน", cls: "bmi-obese" };
}

/** ประมาณ kcal ที่เผาผลาญจากการออกกำลังกาย ถ้าไม่มีค่า kcal ตรงจาก AI ใช้ MET เฉลี่ย = 6 */
export function estimateExerciseKcal(weightKg: number, minutes: number, kcalFromAi?: number): number {
  if (kcalFromAi && kcalFromAi > 0) return Math.round(kcalFromAi);
  const met = 6;
  return Math.round(met * (weightKg || 65) * (minutes / 60));
}
