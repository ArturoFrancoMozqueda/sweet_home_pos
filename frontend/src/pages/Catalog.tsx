import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";

export function Catalog() {
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);

  return (
    <div className="page">
      <h1 className="page-title">Catalogo de Productos</h1>

      {products && products.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {products.map((product) => (
            <div key={product.id} className="catalog-item">
              <div>
                <div className="catalog-name">{product.name}</div>
                {!product.active && (
                  <span className="badge badge-warning" style={{ marginTop: 4 }}>
                    Inactivo
                  </span>
                )}
              </div>
              <span className="catalog-price">${product.price}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📋</p>
          <p>No hay productos. Sincroniza con el servidor.</p>
        </div>
      )}
    </div>
  );
}
