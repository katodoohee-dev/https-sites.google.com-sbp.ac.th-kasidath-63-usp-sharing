import { Router } from "express";
import { z } from "zod";
import { lookupOpenFoodFacts } from "../services/barcode.js";
import { db } from "../db/index.js";

export const barcodeRouter = Router();

/** GET /api/barcode/:code — เช็ค local cache ก่อน ถ้าไม่มีค่อยยิงไป OpenFoodFacts (เทียบ lookupLocalBarcodeDB + lookupOpenFoodFacts เดิม) */
barcodeRouter.get("/:code", async (req, res) => {
  const code = req.params.code;
  if (!/^[0-9]{6,14}$/.test(code)) {
    return res.status(400).json({ success: false, error: "รหัสบาร์โค้ดไม่ถูกต้อง" });
  }

  const cached = db.prepare(`SELECT * FROM barcode_cache WHERE barcode = ?`).get(code) as any;
  if (cached) {
    return res.json({
      success: true,
      product: {
        barcode: cached.barcode,
        name: cached.name,
        brand: cached.brand,
        calories: cached.calories,
        protein: cached.protein,
        carbs: cached.carbs,
        fat: cached.fat,
        imageUrl: cached.image_url,
      },
      source: "cache",
    });
  }

  const product = await lookupOpenFoodFacts(code);
  if (!product) {
    return res.status(404).json({ success: false, error: "ไม่พบสินค้านี้ในฐานข้อมูล ลองกรอกข้อมูลเองได้" });
  }

  db.prepare(
    `INSERT OR REPLACE INTO barcode_cache (barcode, name, brand, calories, protein, carbs, fat, image_url)
     VALUES (@barcode, @name, @brand, @calories, @protein, @carbs, @fat, @imageUrl)`
  ).run({
    barcode: product.barcode,
    name: product.name,
    brand: product.brand ?? null,
    calories: product.calories ?? null,
    protein: product.protein ?? null,
    carbs: product.carbs ?? null,
    fat: product.fat ?? null,
    imageUrl: product.imageUrl ?? null,
  });

  res.json({ success: true, product, source: "openfoodfacts" });
});
