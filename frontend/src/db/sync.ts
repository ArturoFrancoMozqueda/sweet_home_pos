import { db, type DBProduct } from "./database";
import { api } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function fetchImageAsBase64(url: string): Promise<string | undefined> {
  try {
    const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;
    const res = await fetch(fullUrl);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

async function cacheProductImages(products: DBProduct[]): Promise<void> {
  for (const product of products) {
    if (product.image_url && !product.image_data) {
      const base64 = await fetchImageAsBase64(product.image_url);
      if (base64) {
        await db.products.update(product.id, { image_data: base64 });
      }
    }
  }
}

export async function syncToServer(): Promise<boolean> {
  try {
    // Get unsynced sales
    const unsyncedSales = await db.sales.where("synced").equals(0).toArray();
    if (unsyncedSales.length === 0) {
      // Still fetch latest products
      await refreshProducts();
      return true;
    }

    // Build sync payload
    const salesPayload = await Promise.all(
      unsyncedSales.map(async (sale) => {
        const items = await db.saleItems
          .where("sale_uuid")
          .equals(sale.client_uuid)
          .toArray();
        return {
          client_uuid: sale.client_uuid,
          total: sale.total,
          payment_method: sale.payment_method,
          created_at: sale.created_at,
          items: items.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
          })),
        };
      })
    );

    const response = await api.post("/api/sync", { sales: salesPayload });

    if (response.synced_uuids) {
      // Mark synced sales
      await db.transaction("rw", db.sales, async () => {
        for (const uuid of response.synced_uuids) {
          await db.sales.where("client_uuid").equals(uuid).modify({ synced: 1 });
        }
      });
    }

    // Update products from server — preserve local image_data
    if (response.products) {
      const existingProducts = await db.products.toArray();
      const imageDataMap = new Map(
        existingProducts
          .filter((p) => p.image_data)
          .map((p) => [p.id, p.image_data])
      );

      const updatedProducts: DBProduct[] = response.products.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        low_stock_threshold: p.low_stock_threshold,
        active: p.active,
        cost_price: p.cost_price,
        image_url: p.image_url,
        image_data: imageDataMap.get(p.id),
      }));

      await db.transaction("rw", db.products, async () => {
        await db.products.clear();
        await db.products.bulkPut(updatedProducts);
      });

      // Download images for products that have image_url but no local cache
      cacheProductImages(updatedProducts).catch(() => {});
    }

    return true;
  } catch (error) {
    console.warn("Sync failed (offline?):", error);
    return false;
  }
}

export async function refreshProducts(): Promise<boolean> {
  try {
    const products = await api.get("/api/products");
    if (Array.isArray(products)) {
      const existingProducts = await db.products.toArray();
      const imageDataMap = new Map(
        existingProducts
          .filter((p) => p.image_data)
          .map((p) => [p.id, p.image_data])
      );

      const updatedProducts: DBProduct[] = products.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        low_stock_threshold: p.low_stock_threshold,
        active: p.active,
        cost_price: p.cost_price,
        image_url: p.image_url,
        image_data: imageDataMap.get(p.id),
      }));

      await db.transaction("rw", db.products, async () => {
        await db.products.clear();
        await db.products.bulkPut(updatedProducts);
      });

      cacheProductImages(updatedProducts).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}
