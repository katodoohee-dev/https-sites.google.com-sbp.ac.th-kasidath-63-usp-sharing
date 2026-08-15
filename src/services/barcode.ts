// เทียบ lookupOpenFoodFacts เดิม — OpenFoodFacts เป็น public API ไม่ต้องใช้ key

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string;
}

export async function lookupOpenFoodFacts(barcode: string, timeoutMs = 8000): Promise<BarcodeProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const nutriments = p.nutriments || {};
    return {
      barcode,
      name: p.product_name || p.product_name_th || "ไม่ทราบชื่อสินค้า",
      brand: p.brands,
      calories: nutriments["energy-kcal_100g"],
      protein: nutriments["proteins_100g"],
      carbs: nutriments["carbohydrates_100g"],
      fat: nutriments["fat_100g"],
      imageUrl: p.image_url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// เทียบ lookupUpcItemDb เดิม — แหล่งสำรองเวลา OpenFoodFacts หาไม่เจอ (ฟรี ไม่ต้องใช้ key สำหรับ trial endpoint)
// หมายเหตุ: UPCitemdb ไม่มีข้อมูลโภชนาการละเอียด มีแค่ชื่อ/แบรนด์สินค้า ต้องให้ผู้ใช้กรอกแคลอรีเพิ่มเอง
export async function lookupUpcItemDb(barcode: string, timeoutMs = 8000): Promise<BarcodeProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    if (!data || data.code !== "OK" || !data.items?.length) return null;
    const it = data.items[0];
    return {
      barcode,
      name: it.title || `สินค้าบาร์โค้ด ${barcode}`,
      brand: it.brand || undefined,
      calories: undefined,
      protein: undefined,
      carbs: undefined,
      fat: undefined,
      imageUrl: it.images?.[0],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** เทียบ lookupProductByBarcode เดิม — ไล่ลำดับแหล่งข้อมูล: OpenFoodFacts -> UPCitemdb (local cache เช็คก่อนแล้วในชั้น route) */
export async function lookupBarcodeChain(barcode: string): Promise<{ product: BarcodeProduct; source: string } | null> {
  const off = await lookupOpenFoodFacts(barcode);
  if (off) return { product: off, source: "openfoodfacts" };
  const upc = await lookupUpcItemDb(barcode);
  if (upc) return { product: upc, source: "upcitemdb" };
  return null;
}
