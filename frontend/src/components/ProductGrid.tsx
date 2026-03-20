import type { DBProduct } from "../db/database";
import type { CartItem } from "../types";

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
            <span className="product-name">{product.name}</span>
            <span className="product-price">${product.price}</span>
            <span className="product-stock">
              {outOfStock ? "Agotado" : `${product.stock} disp.`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
