import Dexie, { type Table } from "dexie";

export interface DBProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
  low_stock_threshold: number;
  active: boolean;
  cost_price?: number;
  image_url?: string;
  image_data?: string; // base64 data URL for offline display
}

export interface DBSaleItem {
  id?: number;
  sale_uuid: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface DBSale {
  id?: number;
  client_uuid: string;
  total: number;
  payment_method: string;
  created_at: string;
  synced: number; // 0 = pending, 1 = synced, 2 = server rejected (no auto-retry)
  user_id?: number;
  sync_error?: string;
}

class SweetHomeDB extends Dexie {
  products!: Table<DBProduct, number>;
  sales!: Table<DBSale, number>;
  saleItems!: Table<DBSaleItem, number>;

  constructor() {
    super("SweetHomePOS");
    this.version(1).stores({
      products: "id, name, active",
      sales: "++id, client_uuid, created_at, synced",
      saleItems: "++id, sale_uuid, product_id",
    });
    // Version 2: add user_id index to sales
    this.version(2).stores({
      products: "id, name, active",
      sales: "++id, client_uuid, created_at, synced, user_id",
      saleItems: "++id, sale_uuid, product_id",
    });
    // Version 3: image_url on products (no index needed)
    this.version(3).stores({
      products: "id, name, active",
      sales: "++id, client_uuid, created_at, synced, user_id",
      saleItems: "++id, sale_uuid, product_id",
    });
    // Version 4: image_data for offline images (no index needed)
    this.version(4).stores({
      products: "id, name, active",
      sales: "++id, client_uuid, created_at, synced, user_id",
      saleItems: "++id, sale_uuid, product_id",
    });
    // Version 5: sync_error on sales + synced=2 state for server-rejected sales
    this.version(5).stores({
      products: "id, name, active",
      sales: "++id, client_uuid, created_at, synced, user_id",
      saleItems: "++id, sale_uuid, product_id",
    });
  }
}

export const db = new SweetHomeDB();
