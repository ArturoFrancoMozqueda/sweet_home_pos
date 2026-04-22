import { getStoredUser } from "../contexts/AuthContext";
import { api } from "../services/api";
import { db, type DBProduct } from "./database";

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

// Stop caching new images once we're above this fraction of the origin quota.
// Sale writes need headroom â€” losing a sale to a full cache is unacceptable.
const IMAGE_CACHE_QUOTA_CEILING = 0.75;

async function isStorageBelowCeiling(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return true;
    const est = await navigator.storage.estimate();
    if (!est.quota || est.quota <= 0 || est.usage == null) return true;
    return est.usage / est.quota < IMAGE_CACHE_QUOTA_CEILING;
  } catch {
    return true;
  }
}

async function cacheProductImages(products: DBProduct[]): Promise<void> {
  let quotaSkipLogged = false;
  for (const product of products) {
    if (!product.image_url || product.image_data) continue;

    if (!(await isStorageBelowCeiling())) {
      if (!quotaSkipLogged) {
        console.warn(
          "IDB storage above ceiling; skipping remaining product image cache writes"
        );
        quotaSkipLogged = true;
      }
      return;
    }

    const base64 = await fetchImageAsBase64(product.image_url);
    if (!base64) continue;

    try {
      await db.products.update(product.id, { image_data: base64 });
    } catch (err) {
      // QuotaExceededError or similar â€” give up for this sync pass; don't retry now.
      console.warn("Failed to cache product image (storage?):", err);
      return;
    }
  }
}

function mapServerProducts(products: any[], existingProducts: DBProduct[]): DBProduct[] {
  const imageDataMap = new Map(
    existingProducts
      .filter((p) => p.image_data)
      .map((p) => [p.id, p.image_data])
  );

  return products.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    stock: p.stock,
    low_stock_threshold: p.low_stock_threshold,
    active: p.active,
    category: p.category || undefined,
    is_favorite: !!p.is_favorite,
    cost_price: p.cost_price,
    image_url: p.image_url,
    image_data: imageDataMap.get(p.id),
  }));
}

async function replaceProducts(products: any[]): Promise<void> {
  const existingProducts = await db.products.toArray();
  const updatedProducts = mapServerProducts(products, existingProducts);

  await db.transaction("rw", db.products, async () => {
    await db.products.clear();
    await db.products.bulkPut(updatedProducts);
  });

  cacheProductImages(updatedProducts).catch(() => {});
}

function getProductsEndpoint(): string {
  const storedUser = getStoredUser();
  const activeOnly = storedUser?.role === "admin" ? "false" : "true";
  return `/api/products?active_only=${activeOnly}`;
}

export interface SyncResult {
  ok: boolean;
  syncedCount: number;
  failedCount: number;
}

export async function syncToServer(): Promise<SyncResult> {
  try {
    // Get unsynced sales (synced=0 only â€” synced=2 means server already rejected)
    const unsyncedSales = await db.sales.where("synced").equals(0).toArray();
    if (unsyncedSales.length === 0) {
      await refreshProducts();
      return { ok: true, syncedCount: 0, failedCount: 0 };
    }

    const salesPayload = await Promise.all(
      unsyncedSales.map(async (sale) => {
        const items = await db.saleItems
          .where("sale_uuid")
          .equals(sale.client_uuid)
          .toArray();
        const payments =
          Array.isArray(sale.payments) && sale.payments.length > 0
            ? sale.payments
            : [{ method: sale.payment_method, amount: sale.total }];
        return {
          client_uuid: sale.client_uuid,
          total: sale.total,
          payment_method: sale.payment_method,
          payments,
          discount_amount: sale.discount_amount ?? 0,
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

    const syncedUuids: string[] = Array.isArray(response.synced_uuids)
      ? response.synced_uuids
      : [];
    const failures: Array<{ uuid: string; reason: string }> = Array.isArray(response.failed)
      ? response.failed
      : [];

    await db.transaction("rw", db.sales, async () => {
      for (const uuid of syncedUuids) {
        await db.sales.where("client_uuid").equals(uuid).modify({
          synced: 1,
          sync_error: undefined,
        });
      }
      for (const { uuid, reason } of failures) {
        await db.sales.where("client_uuid").equals(uuid).modify({
          synced: 2,
          sync_error: reason,
        });
      }
    });

    if (failures.length > 0) {
      console.warn(`Sync: ${failures.length} sale(s) rejected by server`, failures);
    }

    if (response.products) {
      await replaceProducts(response.products);
    }

    return {
      ok: true,
      syncedCount: syncedUuids.length,
      failedCount: failures.length,
    };
  } catch (error) {
    console.warn("Sync failed (offline?):", error);
    return { ok: false, syncedCount: 0, failedCount: 0 };
  }
}

export async function refreshProducts(): Promise<boolean> {
  try {
    const products = await api.get(getProductsEndpoint());
    if (Array.isArray(products)) {
      await replaceProducts(products);
    }
    return true;
  } catch {
    return false;
  }
}
