import type { DBPayment, DBSale } from "../db/database";

export type PaymentMethodLabel = "efectivo" | "transferencia" | "mixto";

export function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case "efectivo":
      return "Efectivo";
    case "transferencia":
      return "Transferencia";
    case "mixto":
      return "Mixto";
    default:
      return method;
  }
}

export function getSalePaymentEntries(sale: Pick<DBSale, "payment_method" | "payments" | "total">): DBPayment[] {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments;
  }
  if (sale.payment_method === "efectivo" || sale.payment_method === "transferencia") {
    return [{ method: sale.payment_method, amount: sale.total }];
  }
  return [];
}
