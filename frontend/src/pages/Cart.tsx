import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCart, updateCartItem, removeCartItem, getImageUrl, previewPromotion, fetchPromotions } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import { getGuestCartItems, removeGuestCartItem, updateGuestCartItem } from "@/lib/guestCart";
import { clearAppliedPromoCode, getAppliedPromoCode, setAppliedPromoCode } from "@/lib/promoSession";
import { Input } from "@/components/ui/input";

interface CartItem {
    id: number;
    product: {
        id: number;
        name: string;
        price: string;
        image: string | null;
        stock: number;
        slug: string; // Ensure backend serializer sends slug
        final_price?: string;
    };
    quantity: number;
    total_price: number;
}

const Cart = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<number | null>(null);
    const [promoCode, setPromoCode] = useState(getAppliedPromoCode());
    const [promoPreview, setPromoPreview] = useState<any | null>(null);
    const [applyingPromo, setApplyingPromo] = useState(false);
    const [hasActiveDeals, setHasActiveDeals] = useState(false);

    const loadCart = async () => {
        try {
            setLoading(true);
            if (user) {
                const data = await fetchCart();
                setItems(data.items || []);
            } else {
                const guestItems = getGuestCartItems().map((item) => ({
                    id: item.product.id,
                    product: {
                        ...item.product,
                        price: String(item.product.price),
                        final_price: item.product.final_price ? String(item.product.final_price) : undefined,
                    },
                    quantity: item.quantity,
                    total_price: Number(item.product.final_price || item.product.price) * item.quantity,
                }));
                setItems(guestItems);
            }
            const activePromotions = await fetchPromotions();
            setHasActiveDeals((activePromotions || []).length > 0);
        } catch (error) {
            toast.error("Failed to load cart");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCart();
    }, [user]);

    useEffect(() => {
        if (!items.length) {
            setPromoPreview(null);
        }
    }, [items.length]);

    useEffect(() => {
        if (!hasActiveDeals) {
            setPromoPreview(null);
            setPromoCode("");
            clearAppliedPromoCode();
        }
    }, [hasActiveDeals]);

    const handleUpdateQuantity = async (itemId: number, newQty: number, maxStock: number) => {
        if (newQty < 1) return;
        if (newQty > maxStock) return;

        setUpdating(itemId);
        try {
            if (user) {
                const updatedCart = await updateCartItem(itemId, newQty);
                setItems(updatedCart.items || []);
            } else {
                updateGuestCartItem(itemId, newQty);
                loadCart();
            }
        } catch (error) {
            toast.error("Failed to update quantity");
        } finally {
            setUpdating(null);
        }
    };

    const handleRemoveItem = async (itemId: number) => {
        try {
            setUpdating(itemId);
            if (user) {
                const updatedCart = await removeCartItem(itemId);
                setItems(updatedCart.items || []);
            } else {
                removeGuestCartItem(itemId);
                loadCart();
            }
            toast.success("Item removed");
        } catch (error) {
            toast.error("Failed to remove item");
        } finally {
            setUpdating(null);
        }
    };

    const subtotal = items.reduce((sum, item) => {
        // Use final_price if available, else price
        const price = parseFloat(item.product.final_price || item.product.price);
        return sum + (price * item.quantity);
    }, 0);

    const shipping = subtotal > 5000 ? 0 : 250; // Example logic
    const discount = Number(promoPreview?.discount_amount || 0);
    const total = subtotal - discount + shipping;

    const formatPrice = (p: number) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            minimumFractionDigits: 0,
        }).format(p);
    };

    const handleApplyPromo = async () => {
        if (!promoCode.trim()) {
            toast.error("Enter a promo code");
            return;
        }
        try {
            setApplyingPromo(true);
            const preview = await previewPromotion({
                promo_code: promoCode.trim().toUpperCase(),
                items: user ? undefined : items.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
            });
            setPromoPreview(preview);
            setPromoCode(preview.code);
            setAppliedPromoCode(preview.code);
            toast.success("Promo code applied");
        } catch (error: any) {
            setPromoPreview(null);
            clearAppliedPromoCode();
            toast.error(error?.response?.data?.error || "Failed to apply promo code");
        } finally {
            setApplyingPromo(false);
        }
    };

    const handleRemovePromo = () => {
        setPromoPreview(null);
        setPromoCode("");
        clearAppliedPromoCode();
    };

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-20 flex justify-center">
                <Loader size={40} />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
                <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-6">
                    <ShoppingBag className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold font-heading mb-2">Your cart is empty</h2>
                <p className="text-muted-foreground mb-8">Looks like you haven't added anything yet.</p>
                <Link to="/products">
                    <Button size="lg" className="rounded-full px-8">
                        Start Shopping
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title="Shopping Cart" description={`${items.length} items in your cart`} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
                {/* Cart Items */}
                <div className="lg:col-span-2 space-y-4">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className="bg-card border border-border rounded-xl p-4 flex gap-4 items-center animate-fade-in"
                        >
                            {/* Image */}
                            <div className="w-20 h-20 bg-white rounded-lg border border-border overflow-hidden flex-shrink-0">
                                <img
                                    src={getImageUrl(item.product.image) || "/placeholder.png"}
                                    alt={item.product.name}
                                    className="w-full h-full object-contain p-1"
                                />
                            </div>

                            {/* Details */}
                            <div className="flex-grow min-w-0">
                                <Link to={`/products/${item.product.slug}`} className="hover:text-primary transition-colors">
                                    <h3 className="font-heading font-bold text-lg truncate">{item.product.name}</h3>
                                </Link>
                                <div className="flex items-center gap-2">
                                    <p className="text-primary font-bold">{formatPrice(parseFloat(item.product.final_price || item.product.price))}</p>
                                    {item.product.final_price && item.product.final_price !== item.product.price && (
                                        <p className="text-sm text-muted-foreground line-through">{formatPrice(parseFloat(item.product.price))}</p>
                                    )}
                                </div>
                            </div>

                            {/* Quantity */}
                            <div className="flex items-center border border-border rounded-lg bg-background">
                                <button
                                    onClick={() => handleUpdateQuantity(item.id, item.quantity - 1, item.product.stock)}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-secondary rounded-l-lg disabled:opacity-50"
                                    disabled={item.quantity <= 1 || updating === item.id}
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-8 text-center text-sm font-medium">
                                    {updating === item.id ? <Loader size={12} /> : item.quantity}
                                </span>
                                <button
                                    onClick={() => handleUpdateQuantity(item.id, item.quantity + 1, item.product.stock)}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-secondary rounded-r-lg disabled:opacity-50"
                                    disabled={item.quantity >= item.product.stock || updating === item.id}
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>

                            {/* Remove */}
                            <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                                disabled={updating === item.id}
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="lg:col-span-1">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm sticky top-24">
                        <h3 className="font-heading text-xl font-bold mb-6">Order Summary</h3>

                        <div className="space-y-4 mb-6">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal</span>
                                <span className="text-foreground font-medium">{formatPrice(subtotal)}</span>
                            </div>
                            {hasActiveDeals && (
                                <div className="space-y-3 rounded-xl border border-border p-4">
                                    <div className="flex gap-2">
                                        <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Promo code" />
                                        <Button type="button" onClick={handleApplyPromo} disabled={applyingPromo}>
                                            {applyingPromo ? "Applying..." : "Apply"}
                                        </Button>
                                    </div>
                                    {promoPreview && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-green-400">{promoPreview.code} applied</span>
                                            <button type="button" onClick={handleRemovePromo} className="text-muted-foreground hover:text-white">
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {discount > 0 && (
                                <div className="flex justify-between text-green-400">
                                    <span>Discount</span>
                                    <span>-{formatPrice(discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-muted-foreground">
                                <span>Shipping</span>
                                <span className="text-foreground font-medium">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
                            </div>
                            <div className="h-px bg-border" />
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span className="text-primary">{formatPrice(total)}</span>
                            </div>
                        </div>

                        <Link to="/checkout" className="block w-full">
                            <Button size="lg" className="w-full text-lg font-bold shadow-glow hover:shadow-lg transition-all rounded-xl">
                                Checkout <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                        </Link>

                        <div className="mt-4 flex items-center justify-center text-xs text-muted-foreground gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            Secure Checkout
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Cart;
