import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";

export function useProducts() {
  const products = useLiveQuery(
    () => db.products.filter((p) => p.active).sortBy("name"),
    [],
    []
  );
  return products ?? [];
}

export function useAllProducts() {
  const products = useLiveQuery(() => db.products.toArray(), [], []);
  return products ?? [];
}
