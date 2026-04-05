import type { DBProduct } from "../db/database";
import type { CartItem } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Props {
  products: DBProduct[];
  cart: CartItem[];
  onAddToCart: (product: DBProduct) => void;
}

export function ProductGrid({ products, cart, onAddToCart }: Props) {
  const getCartQty = (productId: number) => {
    const item = cart.find((c) => c.product.id === productId);
    return item?.quantity || 0;
  };

  return (
    <div className="product-grid">
      {products.map((product) => {
        const qty = getCartQty(product.id);
        const outOfStock = product.stock <= 0;
        return (
          <button
            key={product.id}
            className={`product-card ${qty > 0 ? "in-cart" : ""} ${outOfStock ? "out-of-stock" : ""}`}
            onClick={() => onAddToCart(product)}
            disabled={outOfStock}
          >
            {qty > 0 && <span className="cart-badge">{qty}</span>}
            <div className="product-img-wrapper">
              {product.image_url ? (
                <img
                  src={product.image_url.startsWith("http") ? product.image_url : `${API_URL}${product.image_url}`}
                  alt={product.name}
                  className="product-img"
                  loading="lazy"
                />
              ) : (
                <div className="product-img-placeholder">🍪</div>
              )}
            </div>
            <span className="product-name">{product.name}</span>
            <span className="product-price">${product.price}</span>
            {outOfStock && <span className="product-out-label">Agotado</span>}
          </button>
        );
      })}
    </div>
  );
}
