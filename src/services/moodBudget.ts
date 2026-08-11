// ย้าย MOOD_DB / MENU_DB / scoreMenu มาจากไฟล์ frontend เดิม (บรรทัด ~7663-7847)
// และ PROTEIN_DB/CARB_DB/VEG_DB/COOK_METHODS/generateBudgetPlan (บรรทัด ~7848-7960+)

export interface MoodProfile {
  mood_id: string;
  icon: string;
  name_th: string;
  target_nutrients: string[];
  coaching_message: string;
}

export interface MenuItem {
  name: string;
  meal_type: string[];
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
  fiber: number;
  healing_tags: string[];
  comfort_score: number;
  coach_tip: string;
}

export const MOOD_DB: MoodProfile[] = [
  {
    mood_id: "stressed", icon: "😣", name_th: "เครียด / วิตกกังวล",
    target_nutrients: ["magnesium", "omega_3", "vitamin_b", "gaba", "healthy_fats"],
    coaching_message: "ช่วงนี้ร่างกายคงหลั่ง Cortisol ออกมาเยอะแน่ๆ ครับ! ลองมื้อที่เน้นแมกนีเซียมกับไขมันดี จะช่วยให้ระบบประสาทคลายตัวลง",
  },
  {
    mood_id: "exhausted", icon: "🥱", name_th: "เหนื่อยล้า / ไม่มีแรง",
    target_nutrients: ["complex_carbs", "iron", "protein", "coq10"],
    coaching_message: "พลังงานหมดถังใช่ไหมครับ? มื้อนี้เน้นคาร์บเชิงซ้อนที่ย่อยช้าๆ ค่อยๆ ปล่อยพลังงาน",
  },
  {
    mood_id: "sad", icon: "😔", name_th: "เศร้า / ซึมเซา",
    target_nutrients: ["tryptophan", "vitamin_d", "tyrosine", "flavonoids"],
    coaching_message: "วันนี้อารมณ์ดูตกๆ นะครับ ลองมื้อที่ช่วยดัน Serotonin กับ Dopamine ดูสิ",
  },
  {
    mood_id: "foggy", icon: "🌫️", name_th: "สมองล้า / คิดงานไม่ออก",
    target_nutrients: ["choline", "flavonoids", "caffeine_light", "omega_3"],
    coaching_message: "สมองตื้อ โฟกัสไม่ค่อยอยู่ใช่ไหมครับ มื้อนี้เน้นโคลีนกับสารต้านอนุมูลอิสระ",
  },
];

export const MENU_DB: MenuItem[] = [
  { name: "แซนด์วิชโฮลวีตอะโวคาโดไข่ต้ม + สลัดปวยเล้งมะเขือเทศ", meal_type: ["breakfast"], kcal: 380, protein: 18, carb: 35, fat: 18, sodium: 380, fiber: 7, healing_tags: ["magnesium", "tryptophan", "healthy_fats"], comfort_score: 9.5, coach_tip: "ไขมันดีจากอะโวคาโดช่วยให้น้ำตาลในเลือดนิ่ง ไม่หงุดหงิดช่วงสาย" },
  { name: "โจ๊กข้าวกล้องไข่ลวกโรยขิงอ่อน", meal_type: ["breakfast"], kcal: 320, protein: 15, carb: 48, fat: 7, sodium: 420, fiber: 4, healing_tags: ["complex_carbs", "iron"], comfort_score: 8.5, coach_tip: "ย่อยง่าย อุ่นท้อง ขิงช่วยกระตุ้นการไหลเวียนเลือด" },
  { name: "กล้วยหอมปิ้งโรยอัลมอนด์ + โยเกิร์ตกรีกน้ำผึ้ง", meal_type: ["breakfast"], kcal: 300, protein: 14, carb: 42, fat: 9, sodium: 90, fiber: 4, healing_tags: ["tryptophan", "vitamin_b"], comfort_score: 9, coach_tip: "ทริปโตเฟนจากกล้วยเป็นสารตั้งต้นของ Serotonin ช่วยยกอารมณ์" },
  { name: "ข้าวไรซ์เบอร์รี สเต๊กอกไก่ย่างซอสเทริยากิมัสตาร์ด + ผักย่าง 3 สี", meal_type: ["main"], kcal: 450, protein: 38, carb: 45, fat: 10, sodium: 560, fiber: 6, healing_tags: ["complex_carbs", "iron", "protein"], comfort_score: 9, coach_tip: "โปรตีนและไฟเบอร์สูงช่วยชะลอการย่อย" },
  { name: "ต้มยำปลาแซลมอนน้ำใส (เห็ดรวม) + ผักลวก", meal_type: ["main"], kcal: 320, protein: 28, carb: 12, fat: 16, sodium: 480, fiber: 3, healing_tags: ["omega_3", "magnesium", "gaba"], comfort_score: 9, coach_tip: "โอเมก้า 3 ในแซลมอนช่วยปรับอารมณ์ให้ผ่อนคลาย พร้อมนอนหลับลึกขึ้น" },
  { name: "แกงเลียงกุ้งสด (ฟักทอง บวบ ใบแมงลัก) + ข้าวกล้อง", meal_type: ["main"], kcal: 380, protein: 22, carb: 45, fat: 10, sodium: 540, fiber: 7, healing_tags: ["magnesium", "fiber"], comfort_score: 8.5, coach_tip: "ผักรวมในแกงเลียงให้แมกนีเซียมและไฟเบอร์สูง" },
  { name: "ผัดกะเพราอกไก่ใส่เห็ดออริจิ + ข้าวกล้อง (เวอร์ชันฮีลใจ)", meal_type: ["main"], kcal: 420, protein: 32, carb: 42, fat: 12, sodium: 620, fiber: 5, healing_tags: ["protein", "complex_carbs"], comfort_score: 9.5, coach_tip: "โปรตีนสูงไขมันต่ำ เห็ดออริจิให้รสอูมามิเข้มข้น" },
  { name: "สลัดควินัวอะโวคาโดไข่ต้มปลาทูน่า", meal_type: ["main"], kcal: 400, protein: 30, carb: 35, fat: 16, sodium: 380, fiber: 8, healing_tags: ["omega_3", "healthy_fats", "tryptophan"], comfort_score: 8.5, coach_tip: "อะโวคาโดและทูน่าให้ไขมันดีและโอเมก้า 3 ช่วยลดการอักเสบในสมอง" },
];

export function scoreMenu(menu: MenuItem, moodProfile: MoodProfile) {
  const matched = menu.healing_tags.filter((t) => moodProfile.target_nutrients.includes(t));
  const tagScore = (matched.length / moodProfile.target_nutrients.length) * 70;
  const comfortScore = (menu.comfort_score / 10) * 30;
  return { total: tagScore + comfortScore, matched };
}

export function recommendMenus(moodId: string, mealBucket: "breakfast" | "main", topN = 3) {
  const moodProfile = MOOD_DB.find((m) => m.mood_id === moodId);
  if (!moodProfile) throw Object.assign(new Error("ไม่พบ mood นี้"), { code: "not_found" });
  const candidates = MENU_DB.filter((m) => m.meal_type.includes(mealBucket));
  const ranked = candidates
    .map((m) => ({ ...m, ...scoreMenu(m, moodProfile) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
  return { moodProfile, ranked };
}

// ================== BUDGET MENU PLANNER ==================

const COOK_METHODS = [
  { id: "boil", name: "ต้ม", sodiumMult: 0.85, fatMult: 0.8, costMult: 1.0 },
  { id: "steam", name: "นึ่ง", sodiumMult: 0.8, fatMult: 0.75, costMult: 1.0 },
  { id: "grill", name: "ย่าง", sodiumMult: 0.95, fatMult: 0.9, costMult: 1.05 },
  { id: "stirfry", name: "ผัดน้ำมันน้อย", sodiumMult: 1.15, fatMult: 1.2, costMult: 1.0 },
  { id: "stew", name: "ตุ๋น", sodiumMult: 1.0, fatMult: 0.9, costMult: 1.05 },
];

const PROTEIN_DB = [
  { id: "egg", name: "ไข่ไก่", tier: "eco", kcal: 155, protein: 13, fat: 11, sodium: 140, cost: 12, tags: [] as string[] },
  { id: "chicken", name: "อกไก่", tier: "eco", kcal: 165, protein: 31, fat: 4, sodium: 75, cost: 22, tags: [] },
  { id: "tofu", name: "เต้าหู้", tier: "eco", kcal: 90, protein: 10, fat: 5, sodium: 10, cost: 10, tags: [] },
  { id: "tilapia", name: "ปลานิล", tier: "eco", kcal: 130, protein: 26, fat: 3, sodium: 60, cost: 25, tags: [] },
  { id: "mackerel", name: "ปลาทู", tier: "eco", kcal: 205, protein: 19, fat: 14, sodium: 90, cost: 18, tags: [] },
  { id: "pork_lean", name: "สันในหมู", tier: "eco", kcal: 143, protein: 26, fat: 4, sodium: 55, cost: 28, tags: [] },
  { id: "salmon", name: "ปลาแซลมอน", tier: "mid", kcal: 208, protein: 22, fat: 13, sodium: 60, cost: 75, tags: [] },
  { id: "beef_tender", name: "เนื้อวัวส่วนสันใน", tier: "mid", kcal: 190, protein: 27, fat: 9, sodium: 60, cost: 90, tags: [] },
  { id: "shrimp", name: "กุ้งสด", tier: "mid", kcal: 99, protein: 24, fat: 1, sodium: 190, cost: 65, tags: ["shrimp"] },
  { id: "tuna", name: "ปลาทูน่า", tier: "mid", kcal: 132, protein: 28, fat: 1, sodium: 40, cost: 55, tags: [] },
];

const CARB_DB = [
  { id: "brown_rice", name: "ข้าวกล้อง", kcal: 216, carb: 45, fiber: 4, cost: 6, gi_low: true, tags: [] as string[] },
  { id: "riceberry", name: "ข้าวไรซ์เบอร์รี่", kcal: 220, carb: 46, fiber: 5, cost: 8, gi_low: true, tags: [] },
  { id: "quinoa", name: "ควินัว", kcal: 222, carb: 39, fiber: 5, cost: 20, gi_low: true, tags: [] },
  { id: "white_rice", name: "ข้าวขาว", kcal: 205, carb: 45, fiber: 1, cost: 5, gi_low: false, tags: [] },
  { id: "oats", name: "ข้าวโอ๊ต", kcal: 190, carb: 32, fiber: 4, cost: 10, gi_low: true, tags: [] },
  { id: "wholewheat", name: "ขนมปังโฮลวีต", kcal: 180, carb: 33, fiber: 4, cost: 12, gi_low: true, tags: ["gluten"] },
];

const VEG_DB = [
  { id: "mixed", name: "ผักรวมลวก", kcal: 35, fiber: 3, sodium: 5, potassium_high: false, cost: 8 },
  { id: "broccoli", name: "บรอกโคลี", kcal: 40, fiber: 3, sodium: 8, potassium_high: false, cost: 12 },
  { id: "cabbage", name: "กะหล่ำปลี", kcal: 25, fiber: 2, sodium: 5, potassium_high: false, cost: 6 },
  { id: "spinach", name: "ผักโขม", kcal: 45, fiber: 3, sodium: 15, potassium_high: true, cost: 10 },
  { id: "mushroom", name: "เห็ดรวม", kcal: 30, fiber: 2, sodium: 6, potassium_high: false, cost: 15 },
];

const BUDGET_MEAL_PCT = { breakfast: 0.25, lunch: 0.4, dinner: 0.35 };

export function budgetTierOf(bahtPerMonth: number): "eco" | "mixed" {
  return bahtPerMonth <= 3000 ? "eco" : "mixed";
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function filteredProteins(tier: "eco" | "mixed", conditions: string[], allergies: string[]) {
  return PROTEIN_DB.filter((p) => {
    if (tier === "eco" && p.tier !== "eco") return false;
    if (allergies.some((a) => p.tags.includes(a))) return false;
    if (conditions.includes("kidney") && p.protein > 27) return false;
    return true;
  });
}
function filteredCarbs(conditions: string[], allergies: string[]) {
  return CARB_DB.filter((c) => {
    if (allergies.includes("gluten") && c.tags.includes("gluten")) return false;
    if (conditions.includes("diabetes") && !c.gi_low) return false;
    return true;
  });
}
function filteredVegs(conditions: string[]) {
  return VEG_DB.filter((v) => !(conditions.includes("kidney") && v.potassium_high));
}

interface Combo {
  name: string; mealType: string; cookMethod: string;
  kcal: number; protein: number; carb: number; fat: number; sodium: number; cost: number;
}

function buildComboPool(mealType: string, tier: "eco" | "mixed", conditions: string[], allergies: string[]): Combo[] {
  const proteins = filteredProteins(tier, conditions, allergies);
  const carbs = filteredCarbs(conditions, allergies);
  const vegs = filteredVegs(conditions);
  let methods = COOK_METHODS;
  if (conditions.includes("hypertension")) methods = methods.filter((m) => m.id !== "stirfry");

  const combos: Combo[] = [];
  for (const p of proteins) {
    for (const c of carbs) {
      for (const v of vegs) {
        for (const m of methods) {
          const sodium = Math.round((p.sodium + v.sodium + 220) * m.sodiumMult);
          const fat = Math.round((p.fat + 3) * m.fatMult);
          const kcal = Math.round(p.kcal * 0.7 + c.kcal * 0.85 + v.kcal * 0.6 + fat * 2);
          const cost = Math.round((p.cost + c.cost + v.cost + 8) * m.costMult);
          if (conditions.includes("hypertension") && sodium > 750) continue;
          combos.push({ name: `${p.name}${m.name} + ${c.name} + ${v.name}`, mealType, cookMethod: m.name, kcal, protein: p.protein, carb: c.carb, fat, sodium, cost });
        }
      }
    }
  }
  return combos;
}

function pickWithinBudget(pool: Combo[], targetCost: number): Combo[] {
  const within = pool.filter((x) => x.cost <= targetCost * 1.15);
  const sortPool = (within.length ? within : pool)
    .slice()
    .sort((a, b) => Math.abs(a.cost - targetCost) - Math.abs(b.cost - targetCost));
  return sortPool;
}

export interface BudgetPlanDay {
  breakfast: Combo | null;
  lunch: Combo | null;
  dinner: Combo | null;
  dayCost: number;
}

export function generateBudgetPlan(monthlyBudget: number, conditions: string[], allergies: string[], days = 7): BudgetPlanDay[] {
  const tier = budgetTierOf(monthlyBudget);
  const dailyBudget = monthlyBudget / 30;
  const mealBudget = {
    breakfast: dailyBudget * BUDGET_MEAL_PCT.breakfast,
    lunch: dailyBudget * BUDGET_MEAL_PCT.lunch,
    dinner: dailyBudget * BUDGET_MEAL_PCT.dinner,
  };
  const seedBase = Math.round(monthlyBudget) + conditions.join("").length * 97 + allergies.join("").length * 53;

  const pools = {
    breakfast: buildComboPool("breakfast", tier, conditions, allergies),
    lunch: buildComboPool("lunch", tier, conditions, allergies),
    dinner: buildComboPool("dinner", tier, conditions, allergies),
  };

  const orders: Record<string, Combo[]> = {};
  (["breakfast", "lunch", "dinner"] as const).forEach((slot, si) => {
    const rng = mulberry32(seedBase + si * 1013);
    const ranked = pickWithinBudget(pools[slot], mealBudget[slot]);
    orders[slot] = seededShuffle(ranked, rng);
  });

  const result: BudgetPlanDay[] = [];
  for (let d = 0; d < days; d++) {
    const day: BudgetPlanDay = { breakfast: null, lunch: null, dinner: null, dayCost: 0 };
    (["breakfast", "lunch", "dinner"] as const).forEach((slot) => {
      const order = orders[slot];
      const combo = order && order.length ? order[d % order.length] : null;
      day[slot] = combo;
      if (combo) day.dayCost += combo.cost;
    });
    result.push(day);
  }
  return result;
}
