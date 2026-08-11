// ย้าย haversineKm/speedToMets มาจากไฟล์เดิม (บรรทัด ~8846-8858)

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function speedToMets(kmh: number): number {
  if (kmh >= 6.4) return 5.0;
  if (kmh >= 4.8) return 3.5;
  return 2.8;
}

/** ประมาณ kcal ที่เผาผลาญจากระยะทาง+ความเร็วเฉลี่ย โดยใช้ MET × น้ำหนัก(kg) × เวลา(ชม.) */
export function estimateKcalBurned(distanceKm: number, seconds: number, weightKg = 65): number {
  if (seconds <= 0) return 0;
  const hours = seconds / 3600;
  const kmh = distanceKm / hours;
  const mets = speedToMets(kmh || 0);
  return Math.round(mets * weightKg * hours);
}
