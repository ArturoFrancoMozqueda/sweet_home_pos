import { useState } from "react";
import type { DBProduct } from "../db/database";
import type { CartItem } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Props {
  products: DBProduct[];
  cart: CartItem[];
  onAddToCart: (product: DBProduct) => void;
}

function ProductCard({
  product,
  qty,
  outOfStock,
  onAddToCart,
}: {
  product: DBProduct;
  qty: number;
  outOfStock: boolean;
  onAddToCart: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  const imgSrc = product.image_data
    || (product.image_url
      ? (product.image_url.startsWith("http") ? product.image_url : `${API_URL}${product.image_url}`)
      : null);

  const showPlaceholder = !imgSrc || imgError;

  return (
    <button
      className={`product-card ${qty > 0 ? "in-cart" : ""} ${outOfStock ? "out-of-stock" : ""}`}
      onClick={onAddToCart}
      disabled={outOfStock}
    >
      {qty > 0 && <span className="cart-badge">{qty}</span>}
      <div className="product-img-wrapper">
        {showPlaceholder ? (
          <div className="product-img-placeholder">🍪</div>
        ) : (
          <img
            src={imgSrc}
            alt=""
            className="product-img"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <span className="product-name">{product.name}</span>
      <span className="product-price">${product.price}</span>
      {outOfStock && <span className="product-out-label">Agotado</span>}
    </button>
  );
}

export function ProductGrid({ products, cart, onAddToCart }: Props) {
  const getCartQty = (productId: number) => {
    const item = cart.find((c) => c.product.id === productId);
    return item?.quantity || 0;
  };

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          qty={getCartQty(product.id)}
          outOfStock={product.stock <= 0}
          onAddToCart={() => onAddToCart(product)}
        />
      ))}
    </div>
  );
}
