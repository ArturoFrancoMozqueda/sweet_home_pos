export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  low_stock_threshold: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SaleItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Sale {
  id?: number;
  client_uuid: string;
  total: number;
  payment_method: "efectivo" | "transferencia" | "mixto";
  created_at: string;
  items: SaleItem[];
  synced: boolean;
}

export interface DailyReport {
  date: string;
  total_sales_count: number;
  total_amount: number;
  estimated_profit?: number;
  total_cost?: number;
  payment_breakdown: { method: string; count: number; total: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
  low_stock_products: { name: string; stock: number; threshold: number }[];
}
