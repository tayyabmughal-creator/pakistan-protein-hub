import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchProducts, addToCart } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { getImageUrl } from "@/lib/api";
import { Star, ShoppingCart, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { useState } from "react";

const ProductList = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const categorySlug = searchParams.get("category");
    const searchQuery = searchParams.get("search");
    const [addingIds, setAddingIds] = useState<number[]>([]);

    const { data, isLoading, error } = useQuery({
        queryKey: ["products", categorySlug, searchQuery],
        queryFn: () => fetchProducts({ category_slug: categorySlug, search: searchQuery }),
    });

    const products = data || [];

    const handleAddToCart = async (e: React.MouseEvent, product: any) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) {
            toast.error("Please login to add items to cart");
            navigate("/login");
            return;
        }

        try {
            setAddingIds(prev => [...prev, product.id]);
            await addToCart(product.id, 1);
            toast.success("Added to cart", {
                description: `${product.name} has been added to your cart.`,
                icon: <Check className="text-green-500" />
            });
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to add to cart");
        } finally {
            setAddingIds(prev => prev.filter(id => id !== product.id));
        }
    };

    // Helper to format category title
    const getTitle = () => {
        if (searchQuery) return `Search Results for "${searchQuery}"`;
        if (!categorySlug) return "All Products";
        return categorySlug
            .split("-")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    const formatPrice = (price: string | number) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            minimumFractionDigits: 0,
        }).format(Number(price));
    };

    return (
        <div className="min-h-screen bg-[#050505] py-20">
            <div className="container mx-auto px-4">
                <div className="mb-12 border-b border-white/10 pb-8">
                    <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-4">
                        {getTitle()}
                    </h1>
                    <p className="text-gray-400">
                        Browse our premium selection of supplements.
                    </p>
                </div>

                {isLoading ? (
                    <div className="space-y-6">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-48 w-full rounded-2xl bg-[#111]" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="text-center py-20">
                        <p className="text-red-500">Failed to load products. Please try again.</p>
                    </div>
                ) : products.length > 0 ? (
                    <div className="space-y-6">
                        {products.map((product: any) => (
                            <div
                                key={product.id}
                                className="group relative bg-[#111] border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row gap-8 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(34,197,94,0.1)] cursor-pointer"
                                onClick={() => navigate(`/products/${product.slug}`)}
                            >
                                {/* Image Section - Left */}
                                <div className="w-full md:w-48 h-48 flex-shrink-0 bg-black/20 rounded-xl p-4 overflow-hidden relative">
                                    <img
                                        src={getImageUrl(product.image) || "/placeholder.png"}
                                        alt={product.name}
                                        className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                                    />
                                </div>

                                {/* Details Section - Right */}
                                <div className="flex-1 flex flex-col">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="text-primary text-xs font-bold uppercase tracking-wider mb-2 block">{product.brand}</span>
                                            <h3 className="font-heading text-2xl font-bold text-white mb-2 group-hover:text-primary transition-colors">
                                                {product.name}
                                            </h3>
                                            <div className="flex items-center gap-1 mb-4">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} className="w-4 h-4 text-primary fill-primary" />
                                                ))}
                                                <span className="text-xs text-gray-500 ml-2">(24 reviews)</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-heading text-2xl font-bold text-white tracking-wide">
                                                {formatPrice(product.final_price || product.price)}
                                            </span>
                                            {product.stock > 0 ? (
                                                <span className="text-xs font-bold text-green-500 flex items-center justify-end gap-1 mt-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                    In Stock
                                                </span>
                                            ) : (
                                                <span className="text-xs font-bold text-red-500 flex items-center justify-end gap-1 mt-1">
                                                    Out of Stock
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <p className="text-gray-400 text-sm line-clamp-2 mb-6 max-w-2xl">
                                        {product.description}
                                    </p>

                                    <div className="mt-auto flex items-center gap-4">
                                        <Button
                                            onClick={(e) => handleAddToCart(e, product)}
                                            disabled={product.stock === 0 || addingIds.includes(product.id)}
                                            className="bg-primary text-black hover:bg-white hover:scale-105 transition-all shadow-glow font-bold relative z-10"
                                        >
                                            {addingIds.includes(product.id) ? (
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            ) : (
                                                <ShoppingCart className="w-4 h-4 mr-2" />
                                            )}
                                            Add to Cart
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="border-white/10 text-primary hover:bg-white hover:text-black relative z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/products/${product.slug}`);
                                            }}
                                        >
                                            View Details
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-[#111] rounded-2xl border border-white/10">
                        <p className="text-gray-400 text-lg">No products found in this category.</p>
                        <Button variant="link" className="text-primary mt-2" onClick={() => navigate("/products")}>
                            View all products
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductList;
