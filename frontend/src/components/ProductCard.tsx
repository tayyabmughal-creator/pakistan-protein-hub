import { ShoppingCart, Star, Loader2 } from "lucide-react";
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
  rating?: number;
  image: string | null;
  badge?: string;
  slug: string;
  onAddToCart?: (id: number) => Promise<void>;
}

const ProductCard = ({ id, name, brand, price, discount_price, final_price, rating = 5, image, badge, slug, onAddToCart }: ProductCardProps) => {
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
    <a href={`/products/${slug}`} className="block h-full">
      <div className="group bg-card-gradient rounded-2xl border border-border overflow-hidden hover:border-primary/50 transition-all duration-300 hover:shadow-card h-full flex flex-col">
        {/* Image */}
        <div className="relative aspect-square bg-secondary/50 overflow-hidden">
          {badge && (
            <div className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-heading font-bold uppercase px-3 py-1 rounded-full z-10">
              {badge}
            </div>
          )}
          <img
            src={getImageUrl(image) || "/placeholder.png"}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-grow">
          <p className="text-xs text-primary font-medium uppercase tracking-wider mb-1">{brand}</p>
          <h3 className="font-heading text-lg font-bold text-foreground mb-2 line-clamp-2">{name}</h3>

          {/* Rating */}
          <div className="flex items-center gap-1 mb-3">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-4 h-4 ${i < rating ? 'text-primary fill-primary' : 'text-muted'}`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">({rating}.0)</span>
          </div>

          <div className="mt-auto pt-2 flex items-center justify-between">
            <div>
              <span className="font-heading text-xl font-bold text-foreground">{formatPrice(displayPrice)}</span>
              {originalPrice && originalPrice > displayPrice && (
                <span className="text-sm text-muted-foreground line-through ml-2">{formatPrice(originalPrice)}</span>
              )}
            </div>
            <Button
              size="icon"
              className="rounded-full shadow-glow hover:shadow-[0_0_30px_hsl(84_81%_44%_/_0.5)]"
              onClick={handleAddToCart}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </a>
  );
};

export default ProductCard;
