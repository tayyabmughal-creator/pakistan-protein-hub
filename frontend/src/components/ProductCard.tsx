import { ShoppingCart, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { getImageUrl } from "@/lib/api";
import { useState } from "react";

interface ProductCardProps {
  id: number;
  name: string;
  brand: string;
  price: number;
  discount_price?: number | null;
  final_price?: number;
  sale_percentage?: number;
  should_show_sale_badge?: boolean;
  image: string | null;
  badge?: string;
  slug: string;
  stock?: number;
  onAddToCart?: (id: number) => Promise<void>;
}

const ProductCard = ({ id, name, brand, price, discount_price, final_price, sale_percentage = 0, should_show_sale_badge = false, image, badge, slug, stock = 0, onAddToCart }: ProductCardProps) => {
  const [loading, setLoading] = useState(false);
  const displayPrice = final_price || discount_price || price;
  const originalPrice = (discount_price || final_price) ? price : undefined;

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
    }).format(p);
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAddToCart) {
      setLoading(true);
      await onAddToCart(id);
      setLoading(false);
    }
  };

  return (
    <a href={`/products/${slug}`} className="block h-full group">
      <div className="relative bg-[#0a0a0a] rounded-xl overflow-hidden h-full flex flex-col border border-white/5 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(34,197,94,0.1)]">

        {/* Badges */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
          {badge && (
            <span className="bg-primary text-black text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
              {badge}
            </span>
          )}
          {should_show_sale_badge && (
            <span className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
              {sale_percentage}% Off
            </span>
          )}
        </div>

        {/* Image Area */}
        <div className="relative aspect-[4/5] bg-[#111] overflow-hidden p-6 group-hover:bg-[#151515] transition-colors">
          <img
            src={getImageUrl(image) || "/placeholder.png"}
            alt={name}
            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500 ease-in-out"
          />
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col flex-grow bg-[#0a0a0a]">
          <p className="text-primary text-xs font-bold uppercase tracking-wider mb-2">{brand}</p>
          <h3 className="font-heading text-lg leading-tight font-medium text-white mb-3 line-clamp-2 group-hover:text-primary transition-colors">
            {name}
          </h3>

          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
            Authentic supplement
          </p>

          <p className={`mb-4 text-xs font-bold uppercase tracking-wider ${stock > 5 ? "text-green-500" : stock > 0 ? "text-amber-400" : "text-red-500"}`}>
            {stock > 0 ? `${stock} in stock` : "Out of stock"}
          </p>

          <div className="mt-auto flex items-center justify-between">
            <div className="flex flex-col">
              {originalPrice && (
                <span className="text-xs text-gray-500 line-through mb-0.5">{formatPrice(originalPrice)}</span>
              )}
              <span className="font-heading text-xl font-bold text-white tracking-wide">{formatPrice(displayPrice)}</span>
            </div>

            <button
              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-black hover:bg-white hover:scale-110 transition-all shadow-[0_0_15px_rgba(34,197,94,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleAddToCart}
              disabled={loading || stock === 0}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5 font-bold" />}
            </button>
          </div>
        </div>
      </div>
    </a>
  );
};

export default ProductCard;
