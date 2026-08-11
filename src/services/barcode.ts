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
