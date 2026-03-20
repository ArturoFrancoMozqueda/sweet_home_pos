import { db } from "./database";
import { api } from "../services/api";

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

    // Update products from server
    if (response.products) {
      await db.transaction("rw", db.products, async () => {
        await db.products.clear();
        await db.products.bulkPut(
          response.products.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            low_stock_threshold: p.low_stock_threshold,
            active: p.active,
          }))
        );
      });
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
      await db.transaction("rw", db.products, async () => {
        await db.products.clear();
        await db.products.bulkPut(
          products.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            low_stock_threshold: p.low_stock_threshold,
            active: p.active,
          }))
        );
      });
    }
    return true;
  } catch {
    return false;
  }
}
