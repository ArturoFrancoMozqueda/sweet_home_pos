import Dexie, { type Table } from "dexie";

export interface DBProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
  low_stock_threshold: number;
  active: boolean;
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
  synced: number; // 0 = not synced, 1 = synced
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
  }
}

export const db = new SweetHomeDB();
