// ย้าย doCheckin/checkinGreeting/monthKey/daysBetween จากไฟล์เดิม (บรรทัด ~9125-9185)
// รวมกลไก "บัตรป้องกัน Streak ขาด" (freeze) 2 ครั้ง/เดือน เหมือนต้นฉบับ

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface CheckinRow {
  streak: number;
  last_date: string | null;
  freeze_available: number;
  freeze_month_key: string | null;
}

export interface CheckinResult {
  streak: number;
  lastDate: string | null;
  freezeAvailable: number;
  alreadyCheckedInToday: boolean;
  usedFreeze: boolean;
}

/** เทียบ doCheckin เดิม — คำนวณ state ใหม่แบบ pure function ทดสอบง่าย */
export function computeCheckin(row: CheckinRow, today = todayStr()): CheckinResult {
  if (row.last_date === today) {
    return {
      streak: row.streak,
      lastDate: row.last_date,
      freezeAvailable: row.freeze_available,
      alreadyCheckedInToday: true,
      usedFreeze: false,
    };
  }

  const mk = monthKey(today);
  let freezeAvailable = row.freeze_available;
  if (row.freeze_month_key !== mk) {
    freezeAvailable = 2;
  }

  let streak: number;
  let usedFreeze = false;
  if (!row.last_date) {
    streak = 1;
  } else {
    const gap = daysBetween(row.last_date, today);
    if (gap === 1) {
      streak = row.streak + 1;
    } else if (gap > 1) {
      const missedDays = gap - 1;
      if (missedDays <= freezeAvailable) {
        freezeAvailable -= missedDays;
        streak = row.streak + 1;
        usedFreeze = true;
      } else {
        streak = 1; // ขาดเกินสิทธิ์ freeze -> streak รีเซ็ตใหม่
      }
    } else {
      streak = row.streak; // gap <= 0 ที่ไม่ใช่วันนี้ (เผื่อ edge case เวลาต่าง timezone)
    }
  }

  return { streak, lastDate: today, freezeAvailable, alreadyCheckedInToday: false, usedFreeze };
}

/** เทียบ checkinGreeting เดิม — ข้อความทักทายตามช่วงเวลา + สถานะ streak */
export function checkinGreeting(streak: number, alreadyCheckedInToday: boolean, hour = new Date().getHours()): string {
  if (alreadyCheckedInToday) {
    if (streak >= 10) return `ครบเป้าหมาย ${streak}/10 วัน แล้ว! สุดยอดมากครับ วันนี้เช็คอินเรียบร้อย`;
    if (streak >= 7) return `สุดยอดมากครับ! อีกแค่ ${10 - streak} วันจะบรรลุเป้าหมายแรกแล้ว รักษาสปีดนี้ไว้นะครับ`;
    return `เช็คอินวันนี้เรียบร้อยแล้วครับ ตอนนี้ streak ${streak}/10 วัน`;
  }
  let timeMsg: string;
  if (hour < 11) timeMsg = "อรุณสวัสดิ์ครับ! เช้านี้อย่าลืมดื่มน้ำเปล่า 1 แก้วเพื่อกระตุ้นระบบเผาผลาญนะ";
  else if (hour < 16) timeMsg = "สวัสดีตอนบ่ายครับ อย่าลืมมื้อกลางวันและเช็คอินวันนี้ด้วยนะ";
  else if (hour < 20) timeMsg = "สวัสดีตอนเย็นครับ ใกล้จะครบวันแล้ว อย่าลืมเช็คอินก่อนนอนนะ";
  else timeMsg = "ดึกแล้วนะครับ อย่าลืมเช็คอินก่อนที่ streak จะขาดวันนี้!";
  return `${timeMsg} ตอนนี้ streak ของคุณ ${streak}/10 วัน`;
}
