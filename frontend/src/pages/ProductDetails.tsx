import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Star, Minus, Plus, ShoppingCart, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchProductBySlug, getImageUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";
import Loader from "@/components/Loader";

interface Product {
    id: number;
    name: string;
    slug: string;
    description: string;
    price: string;
    stock: number;
    image: string | null;
    category: number;
    brand: string;
    created_at: string;
    updated_at: string;
    is_active: boolean;
}

const ProductDetails = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [quantity, setQuantity] = useState(1);
    const [addingToCart, setAddingToCart] = useState(false);
    const [activeImage, setActiveImage] = useState<string | null>(null);
    const [showViewCart, setShowViewCart] = useState(false);

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
            toast.error("Please login to add items to cart");
            navigate("/login", { state: { from: `/products/${slug}` } });
            return;
        }

        if (!product) return;

        try {
            setAddingToCart(true);
            await apiClient.post("/cart/items/", {
                product_id: product.id,
                quantity: quantity,
            });
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
            <div className="container mx-auto px-4 py-20 flex justify-center">
                <Loader size={40} />
            </div>
        );
    }

    if (!product) return null;

    const formattedPrice = new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0,
    }).format(parseFloat(product.price));

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
                {/* Image Gallery */}
                <div className="space-y-4">
                    <div className="aspect-square bg-white rounded-2xl border border-border overflow-hidden shadow-sm relative group">
                        <img
                            src={getImageUrl(activeImage) || "/placeholder.png"}
                            alt={product.name}
                            className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                        />
                    </div>
                    {/* Thumbnails - For now using the main image as a single thumbnail since backend has single image supported mostly */}
                    <div className="flex gap-4 overflow-x-auto pb-2">
                        <button
                            onClick={() => setActiveImage(product.image)}
                            className={`relative w-20 h-20 rounded-lg border-2 overflow-hidden flex-shrink-0 ${activeImage === product.image ? "border-primary" : "border-border hover:border-primary/50"
                                }`}
                        >
                            <img
                                src={getImageUrl(product.image) || "/placeholder.png"}
                                alt="Thumbnail"
                                className="w-full h-full object-cover"
                            />
                        </button>
                        {/* If we had more images, map them here */}
                    </div>
                </div>

                {/* Product Info */}
                <div className="space-y-6">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-primary tracking-wider uppercase bg-primary/10 px-3 py-1 rounded-full">
                                {product.brand}
                            </span>
                            {/* Stock Badge */}
                            {product.stock > 0 ? (
                                <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    In Stock ({product.stock})
                                </span>
                            ) : (
                                <span className="text-sm font-medium text-destructive flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-destructive"></span>
                                    Out of Stock
                                </span>
                            )}
                        </div>
                        <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground leading-tight">
                            {product.name}
                        </h1>
                        <div className="flex items-center gap-4 mt-4">
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className={`w-5 h-5 ${i < 4 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                                ))}
                            </div>
                            <span className="text-sm text-muted-foreground">(24 reviews)</span>
                        </div>
                    </div>

                    <div className="h-px bg-border" />

                    <div>
                        <span className="text-4xl font-heading font-bold text-primary block">
                            {formattedPrice}
                        </span>
                        <p className="text-muted-foreground mt-4 leading-relaxed">
                            {product.description}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="space-y-4 pt-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center border border-border rounded-xl bg-card">
                                <button
                                    onClick={() => handleQuantityChange(-1)}
                                    className="w-12 h-12 flex items-center justify-center text-foreground hover:bg-secondary rounded-l-xl transition-colors"
                                    disabled={quantity <= 1}
                                >
                                    <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-12 text-center font-heading font-bold text-lg">
                                    {quantity}
                                </span>
                                <button
                                    onClick={() => handleQuantityChange(1)}
                                    className="w-12 h-12 flex items-center justify-center text-foreground hover:bg-secondary rounded-r-xl transition-colors"
                                    disabled={quantity >= product.stock}
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            <Button
                                size="lg"
                                className="flex-1 h-12 text-lg font-heading tracking-wide rounded-xl shadow-glow hover:shadow-lg transition-all"
                                onClick={handleAddToCart}
                                disabled={product.stock === 0 || addingToCart}
                            >
                                {addingToCart ? (
                                    <>
                                        <Loader size={20} className="mr-2" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <ShoppingCart className="w-5 h-5 mr-2" />
                                        Add to Cart
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* View Cart Button (Visible after adding) */}
                        <div className={`transition-all duration-300 overflow-hidden ${showViewCart ? 'max-h-20 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                            <Button
                                variant="outline"
                                size="lg"
                                className="w-full text-lg font-heading tracking-wide rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                                onClick={() => navigate("/cart")}
                            >
                                View Cart & Checkout
                            </Button>
                        </div>
                    </div>

                    {/* Detailed Info Accordions or Tabs could go here */}
                </div>
            </div>
        </div>
    );
};

export default ProductDetails;
