import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingCart, Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchProductBySlug, fetchReviews, getImageUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import apiClient from "@/lib/apiClient";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { addGuestCartItem } from "@/lib/guestCart";

interface Product {
    id: number;
    name: string;
    slug: string;
    description: string;
    price: string;
    discount_price?: string | null;
    final_price?: string;
    show_sale_badge?: boolean;
    sale_percentage?: number;
    should_show_sale_badge?: boolean;
    stock: number;
    image: string | null;
    category: number;
    brand: string;
    created_at: string;
    updated_at: string;
    is_active: boolean;
}

interface Review {
    id: number;
    user_name: string;
    rating: number;
    comment: string;
    created_at: string;
}

const ProductDetails = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [quantity, setQuantity] = useState(1);
    const [addingToCart, setAddingToCart] = useState(false);
    const [activeImage, setActiveImage] = useState<string | null>(null);
    const [showViewCart, setShowViewCart] = useState(false);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(true);

    useEffect(() => {
        const loadProduct = async () => {
            try {
                setLoading(true);
                if (!slug) return;
                const data = await fetchProductBySlug(slug);
                setProduct(data);
                setActiveImage(data.image);
            } catch (error) {
                toast.error("Failed to load product");
                navigate("/not-found");
            } finally {
                setLoading(false);
            }
        };
        loadProduct();
    }, [slug, navigate]);

    useEffect(() => {
        const loadReviews = async () => {
            if (!product) {
                setReviews([]);
                setReviewsLoading(false);
                return;
            }

            try {
                setReviewsLoading(true);
                const data = await fetchReviews(product.id);
                setReviews(Array.isArray(data) ? data : []);
            } catch {
                setReviews([]);
            } finally {
                setReviewsLoading(false);
            }
        };

        loadReviews();
    }, [product]);

    const handleQuantityChange = (delta: number) => {
        setQuantity((prev) => {
            const newQty = prev + delta;
            if (newQty < 1) return 1;
            if (product && newQty > product.stock) return product.stock;
            return newQty;
        });
    };

    const handleAddToCart = async () => {
        if (!user) {
            addGuestCartItem({
                id: product.id,
                name: product.name,
                slug: product.slug,
                image: product.image,
                price: product.price,
                final_price: product.final_price,
                stock: product.stock,
            }, quantity);
            toast.success("Added to cart", {
                description: `${quantity} x ${product.name}`,
                icon: <Check className="text-green-500" />,
            });
            setShowViewCart(true);
            return;
        }

        if (!product) return;

        try {
            setAddingToCart(true);
            await apiClient.post("/cart/items/", {
                product_id: product.id,
                quantity: quantity,
            });
            queryClient.invalidateQueries({ queryKey: ["cart"] });
            toast.success("Added to cart", {
                description: `${quantity} x ${product.name}`,
                icon: <Check className="text-green-500" />,
            });
            setShowViewCart(true);
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to add to cart");
        } finally {
            setAddingToCart(false);
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-20 flex justify-center bg-[#050505] min-h-[60vh]">
                <Loader size={40} />
            </div>
        );
    }

    if (!product) return null;

    const formatPrice = (p: string | number) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            minimumFractionDigits: 0,
        }).format(Number(p));
    };

    const hasDiscount = product.discount_price || (product.final_price && Number(product.final_price) < Number(product.price));
    const displayPrice = product.final_price || product.discount_price || product.price;
    const showSaleBadge = Boolean(product.should_show_sale_badge);
    const averageRating = reviews.length
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0;

    return (
        <div className="min-h-screen bg-[#050505] py-12">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
                    {/* Image Gallery */}
                    <div className="space-y-4">
                        <div className="aspect-square bg-[#111] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative group">
                            <img
                                src={getImageUrl(activeImage) || "/placeholder.png"}
                                alt={product.name}
                                className="w-full h-full object-contain p-8 group-hover:scale-105 transition-transform duration-500"
                            />
                            {showSaleBadge && (
                                <div className="absolute top-4 left-4 bg-white text-black font-bold px-3 py-1 rounded text-sm uppercase tracking-wider">
                                    {product.sale_percentage}% Off
                                </div>
                            )}
                        </div>
                        {/* Thumbnails */}
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                            <button
                                onClick={() => setActiveImage(product.image)}
                                className={`relative w-20 h-20 rounded-xl border-2 overflow-hidden flex-shrink-0 transition-all ${activeImage === product.image ? "border-primary shadow-[0_0_10px_rgba(34,197,94,0.3)]" : "border-white/10 hover:border-primary/50"
                                    }`}
                            >
                                <div className="absolute inset-0 bg-[#111]"></div>
                                <img
                                    src={getImageUrl(product.image) || "/placeholder.png"}
                                    alt="Thumbnail"
                                    className="relative w-full h-full object-cover p-2"
                                />
                            </button>
                        </div>
                    </div>

                    {/* Product Info */}
                    <div className="space-y-8">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm font-bold text-primary tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                                    {product.brand}
                                </span>
                                {/* Stock Badge */}
                                {product.stock > 0 ? (
                                    <span className="text-sm font-bold text-green-500 flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        In Stock ({product.stock})
                                    </span>
                                ) : (
                                    <span className="text-sm font-bold text-red-500 flex items-center gap-2 bg-red-500/10 px-3 py-1 rounded-full">
                                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                        Out of Stock
                                    </span>
                                )}
                            </div>
                            <h1 className="font-heading text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                                {product.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
                                <div className="flex items-center gap-2">
                                    <Star className="w-4 h-4 fill-primary text-primary" />
                                    <span className="font-semibold">
                                        {reviews.length ? `${averageRating.toFixed(1)} / 5` : "No ratings yet"}
                                    </span>
                                </div>
                                <span className="text-gray-500">|</span>
                                <span>{reviews.length} customer review{reviews.length === 1 ? "" : "s"}</span>
                                <span className="text-gray-500">|</span>
                                <span className="uppercase tracking-wider text-gray-400 font-medium">
                                    Cash on delivery available
                                </span>
                            </div>
                        </div>

                        <div className="h-px bg-white/10" />

                        <div>
                            {hasDiscount && (
                                <span className="text-xl text-gray-500 line-through block mb-1 font-medium">
                                    {formatPrice(product.price)}
                                </span>
                            )}
                            <span className="text-4xl md:text-5xl font-heading font-bold text-primary block tracking-wide">
                                {formatPrice(displayPrice)}
                            </span>
                            <p className="text-gray-400 mt-6 leading-relaxed text-lg font-light">
                                {product.description}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="space-y-6 pt-6">
                            <div className="flex items-center gap-4 max-w-md">
                                <div className="flex items-center border border-white/20 rounded-xl bg-[#111]">
                                    <button
                                        onClick={() => handleQuantityChange(-1)}
                                        className="w-14 h-14 flex items-center justify-center text-white hover:bg-white/5 rounded-l-xl transition-colors disabled:opacity-50"
                                        disabled={quantity <= 1}
                                    >
                                        <Minus className="w-5 h-5" />
                                    </button>
                                    <span className="w-14 text-center font-heading font-bold text-xl text-white">
                                        {quantity}
                                    </span>
                                    <button
                                        onClick={() => handleQuantityChange(1)}
                                        className="w-14 h-14 flex items-center justify-center text-white hover:bg-white/5 rounded-r-xl transition-colors disabled:opacity-50"
                                        disabled={quantity >= product.stock}
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>

                                <Button
                                    size="lg"
                                    className="flex-1 h-14 text-lg font-heading font-bold tracking-wide rounded-xl bg-primary text-black hover:bg-white hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                                    onClick={handleAddToCart}
                                    disabled={product.stock === 0 || addingToCart}
                                >
                                    {addingToCart ? (
                                        <>
                                            <Loader size={24} className="mr-3 text-black" />
                                            Adding...
                                        </>
                                    ) : (
                                        <>
                                            <ShoppingCart className="w-6 h-6 mr-3 font-bold" />
                                            ADD TO CART
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* View Cart Button (Visible after adding) */}
                            <div className={`transition-all duration-500 ease-out overflow-hidden ${showViewCart ? 'max-h-24 opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-4'}`}>
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="w-full max-w-md h-12 text-lg font-heading tracking-wide rounded-xl border-2 border-white/20 bg-transparent text-white hover:bg-white hover:text-black transition-all"
                                    onClick={() => navigate("/cart")}
                                >
                                    View Cart & Checkout
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-16 rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 md:p-8">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="font-heading text-2xl font-bold text-white">Customer Reviews</h2>
                            <p className="mt-2 text-sm text-gray-400">
                                Reviews are shown from verified buyers who received this product.
                            </p>
                        </div>
                        {reviews.length > 0 && (
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                                <Star className="w-4 h-4 fill-primary text-primary" />
                                <span className="font-semibold">{averageRating.toFixed(1)} average rating</span>
                                <span className="text-gray-500">from {reviews.length} review{reviews.length === 1 ? "" : "s"}</span>
                            </div>
                        )}
                    </div>

                    {reviewsLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader size={28} />
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-gray-400">
                            No customer reviews yet for this product.
                        </div>
                    ) : (
                        <div className="mt-8 grid gap-4">
                            {reviews.map((review) => (
                                <article
                                    key={review.id}
                                    className="rounded-xl border border-white/10 bg-black/20 p-5"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <p className="font-semibold text-white">{review.user_name}</p>
                                            <p className="mt-1 text-xs uppercase tracking-wider text-primary">
                                                Verified purchase
                                            </p>
                                        </div>
                                        <div className="text-left md:text-right">
                                            <div className="flex items-center gap-1 md:justify-end">
                                                {Array.from({ length: 5 }).map((_, index) => (
                                                    <Star
                                                        key={index}
                                                        className={`h-4 w-4 ${index < review.rating ? "fill-primary text-primary" : "text-gray-600"}`}
                                                    />
                                                ))}
                                            </div>
                                            <p className="mt-2 text-xs text-gray-500">
                                                {new Date(review.created_at).toLocaleDateString("en-PK", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="mt-4 leading-relaxed text-gray-300">{review.comment}</p>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductDetails;
