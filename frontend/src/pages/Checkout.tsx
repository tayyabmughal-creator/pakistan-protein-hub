import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus, MapPin, Truck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    createGuestOrder,
    createOrder,
    createPaymentSession,
    fetchAddresses,
    fetchCart,
    fetchPaymentMethods,
    fetchPromotions,
} from "@/lib/api";
import { previewPromotion } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import AddressForm from "@/components/AddressForm";
import { clearGuestCart, getGuestCartItems } from "@/lib/guestCart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveGuestOrderConfirmation } from "@/lib/guestOrderSession";
import { clearAppliedPromoCode, getAppliedPromoCode } from "@/lib/promoSession";

interface Address {
    id: number;
    full_name: string;
    phone_number: string;
    city: string;
    area: string;
    street: string;
    is_default: boolean;
}

type GuestFormValues = {
    guest_name: string;
    guest_email: string;
    guest_phone_number: string;
    city: string;
    area: string;
    street: string;
};

type GuestFormErrors = Partial<Record<keyof GuestFormValues, string>>;

type PaymentMethod = {
    code: string;
    label: string;
    description: string;
    provider: string;
    is_online: boolean;
    requires_reference: boolean;
    reference_label: string;
    details: string[];
};

const Checkout = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [cartTotal, setCartTotal] = useState(0);
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
    const [showAddressForm, setShowAddressForm] = useState(false);
    const [placingOrder, setPlacingOrder] = useState(false);
    const [promoPreview, setPromoPreview] = useState<any | null>(null);
    const [hasActiveDeals, setHasActiveDeals] = useState(false);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("COD");
    const [paymentReference, setPaymentReference] = useState("");
    const [paymentNote, setPaymentNote] = useState("");
    const [guestForm, setGuestForm] = useState<GuestFormValues>({
        guest_name: "",
        guest_email: "",
        guest_phone_number: "",
        city: "",
        area: "",
        street: "",
    });
    const [guestErrors, setGuestErrors] = useState<GuestFormErrors>({});

    const setGuestField = (field: keyof GuestFormValues, value: string) => {
        setGuestForm((prev) => ({ ...prev, [field]: value }));
        setGuestErrors((prev) => {
            if (!prev[field]) return prev;
            const nextErrors = { ...prev };
            delete nextErrors[field];
            return nextErrors;
        });
    };

    const validateGuestForm = () => {
        const errors: GuestFormErrors = {};

        if (!guestForm.guest_name.trim()) {
            errors.guest_name = "Full name is required.";
        }

        if (!guestForm.guest_email.trim()) {
            errors.guest_email = "Email is required.";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestForm.guest_email.trim())) {
            errors.guest_email = "Enter a valid email address.";
        }

        const normalizedPhone = guestForm.guest_phone_number.replace(/[^\d+]/g, "");
        if (!guestForm.guest_phone_number.trim()) {
            errors.guest_phone_number = "Phone number is required.";
        } else if (normalizedPhone.length < 10) {
            errors.guest_phone_number = "Enter a valid phone number.";
        }

        if (!guestForm.city.trim()) {
            errors.city = "City is required.";
        }

        if (!guestForm.area.trim()) {
            errors.area = "Area is required.";
        }

        if (!guestForm.street.trim()) {
            errors.street = "Street address is required.";
        }

        setGuestErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const cartData = user
                ? await fetchCart()
                : {
                    items: getGuestCartItems().map((item) => ({
                        product: item.product,
                        quantity: item.quantity,
                    })),
                };

            if (!cartData.items || cartData.items.length === 0) {
                toast.error("Your cart is empty");
                navigate("/cart");
                return;
            }

            const subtotal = cartData.items.reduce((sum: number, item: any) => {
                const price = parseFloat(item.product.final_price || item.product.price);
                return sum + (price * item.quantity);
            }, 0);
            setCartTotal(subtotal);
            const [activePromotions, availablePaymentMethods] = await Promise.all([
                fetchPromotions(),
                fetchPaymentMethods(),
            ]);
            const hasDeals = (activePromotions || []).length > 0;
            setHasActiveDeals(hasDeals);
            setPaymentMethods(availablePaymentMethods);
            setSelectedPaymentMethod((currentMethod) => {
                if (availablePaymentMethods.some((method: PaymentMethod) => method.code === currentMethod)) {
                    return currentMethod;
                }
                return availablePaymentMethods[0]?.code || "COD";
            });
            const storedPromo = getAppliedPromoCode();
            if (storedPromo && hasDeals) {
                try {
                    const preview = await previewPromotion({
                        promo_code: storedPromo,
                        items: user ? undefined : cartData.items.map((item: any) => ({ product_id: item.product.id, quantity: item.quantity })),
                    });
                    setPromoPreview(preview);
                } catch {
                    clearAppliedPromoCode();
                    setPromoPreview(null);
                }
            } else {
                if (!hasDeals) {
                    clearAppliedPromoCode();
                }
                setPromoPreview(null);
            }

            if (user) {
                const addressData = await fetchAddresses();
                setAddresses(addressData);

                const defaultAddr = addressData.find((a: Address) => a.is_default);
                if (defaultAddr) {
                    setSelectedAddressId(defaultAddr.id);
                } else if (addressData.length > 0) {
                    setSelectedAddressId(addressData[0].id);
                }
            } else {
                setAddresses([]);
            }

        } catch (error) {
            toast.error("Failed to load checkout data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [user]);

    const handlePlaceOrder = async () => {
        try {
            setPlacingOrder(true);
            let order;
            const selectedMethod = paymentMethods.find((method) => method.code === selectedPaymentMethod);

            if (selectedMethod?.requires_reference && !paymentReference.trim()) {
                toast.error("Please enter the payment transaction reference.");
                return;
            }

            if (selectedPaymentMethod === "SAFEPAY") {
                if (user) {
                    if (!selectedAddressId) {
                        toast.error("Please select a delivery address");
                        return;
                    }
                    const session = await createPaymentSession({
                        address_id: selectedAddressId,
                        payment_method: selectedPaymentMethod,
                        promo_code: promoPreview?.code,
                    });
                    window.location.assign(session.checkout_url);
                    return;
                }

                const guestItems = getGuestCartItems();
                if (guestItems.length === 0) {
                    toast.error("Your cart is empty");
                    return;
                }
                if (!validateGuestForm()) {
                    toast.error("Please correct the highlighted delivery details");
                    return;
                }
                const session = await createPaymentSession({
                    ...guestForm,
                    payment_method: selectedPaymentMethod,
                    promo_code: promoPreview?.code,
                    items: guestItems.map((item) => ({
                        product_id: item.product.id,
                        quantity: item.quantity,
                    })),
                });
                window.location.assign(session.checkout_url);
                return;
            }

            if (user) {
                if (!selectedAddressId) {
                    toast.error("Please select a delivery address");
                    return;
                }
                order = await createOrder({
                    address_id: selectedAddressId,
                    payment_method: selectedPaymentMethod,
                    promo_code: promoPreview?.code,
                    payment_reference: paymentReference.trim(),
                    payment_note: paymentNote.trim(),
                });
                navigate(`/orders/${order.id}`);
            } else {
                const guestItems = getGuestCartItems();
                if (guestItems.length === 0) {
                    toast.error("Your cart is empty");
                    return;
                }
                if (!validateGuestForm()) {
                    toast.error("Please correct the highlighted delivery details");
                    return;
                }
                order = await createGuestOrder({
                    ...guestForm,
                    payment_method: selectedPaymentMethod,
                    promo_code: promoPreview?.code,
                    payment_reference: paymentReference.trim(),
                    payment_note: paymentNote.trim(),
                    items: guestItems.map((item) => ({
                        product_id: item.product.id,
                        quantity: item.quantity,
                    })),
                });
                saveGuestOrderConfirmation(order);
                clearGuestCart();
                clearAppliedPromoCode();
                navigate("/guest-order-confirmation", { state: { order } });
            }
            clearAppliedPromoCode();
            toast.success("Order placed successfully!");
        } catch (error: any) {
            console.error("Order placement error:", error);
            const errorMessage = error.response?.data?.error || error.response?.data?.detail || "Failed to place order. Please try again.";
            toast.error(errorMessage);
        } finally {
            setPlacingOrder(false);
        }
    };

    const handleAddressAdded = () => {
        setShowAddressForm(false);
        loadData();
    };

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-20 flex justify-center">
                <Loader size={40} />
            </div>
        );
    }

    const shipping = cartTotal > 5000 ? 0 : 250;
    const discount = Number(promoPreview?.discount_amount || 0);
    const finalTotal = cartTotal - discount + shipping;
    const selectedMethod = paymentMethods.find((method) => method.code === selectedPaymentMethod);

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title="Checkout" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Step 1: Address */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
                            <MapPin className="text-primary" /> Delivery Address
                        </h3>

                        {user && !showAddressForm ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {addresses.map((addr) => (
                                        <div
                                            key={addr.id}
                                            onClick={() => setSelectedAddressId(addr.id)}
                                            className={`cursor-pointer border rounded-xl p-4 transition-all relative ${selectedAddressId === addr.id
                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                : "border-border hover:border-primary/50"
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-bold">{addr.full_name}</span>
                                                {selectedAddressId === addr.id && <Check className="w-5 h-5 text-primary" />}
                                            </div>
                                            <p className="text-sm text-muted-foreground">{addr.street}</p>
                                            <p className="text-sm text-muted-foreground">{addr.area}, {addr.city}</p>
                                            <p className="text-sm text-muted-foreground mt-2">{addr.phone_number}</p>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => setShowAddressForm(true)}
                                        className="border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors min-h-[160px]"
                                    >
                                        <Plus className="w-8 h-8" />
                                        <span className="font-medium">Add New Address</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            user ? (
                                <AddressForm onSuccess={handleAddressAdded} onCancel={() => setShowAddressForm(false)} />
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="guest_name">Full Name</Label>
                                            <Input id="guest_name" value={guestForm.guest_name} onChange={(e) => setGuestField("guest_name", e.target.value)} aria-invalid={Boolean(guestErrors.guest_name)} />
                                            {guestErrors.guest_name && <p className="text-sm text-destructive">{guestErrors.guest_name}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="guest_email">Email</Label>
                                            <Input id="guest_email" type="email" value={guestForm.guest_email} onChange={(e) => setGuestField("guest_email", e.target.value)} aria-invalid={Boolean(guestErrors.guest_email)} />
                                            {guestErrors.guest_email && <p className="text-sm text-destructive">{guestErrors.guest_email}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="guest_phone_number">Phone Number</Label>
                                            <Input id="guest_phone_number" value={guestForm.guest_phone_number} onChange={(e) => setGuestField("guest_phone_number", e.target.value)} aria-invalid={Boolean(guestErrors.guest_phone_number)} />
                                            {guestErrors.guest_phone_number && <p className="text-sm text-destructive">{guestErrors.guest_phone_number}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="city">City</Label>
                                            <Input id="city" value={guestForm.city} onChange={(e) => setGuestField("city", e.target.value)} aria-invalid={Boolean(guestErrors.city)} />
                                            {guestErrors.city && <p className="text-sm text-destructive">{guestErrors.city}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="area">Area</Label>
                                            <Input id="area" value={guestForm.area} onChange={(e) => setGuestField("area", e.target.value)} aria-invalid={Boolean(guestErrors.area)} />
                                            {guestErrors.area && <p className="text-sm text-destructive">{guestErrors.area}</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="street">Street Address</Label>
                                        <Textarea id="street" value={guestForm.street} onChange={(e) => setGuestField("street", e.target.value)} aria-invalid={Boolean(guestErrors.street)} />
                                        {guestErrors.street && <p className="text-sm text-destructive">{guestErrors.street}</p>}
                                    </div>
                                </div>
                            )
                        )}
                    </div>

                    {/* Step 2: Payment */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
                            <CreditCard className="text-primary" /> Payment Method
                        </h3>
                        <div className="space-y-3">
                            {paymentMethods.map((method) => {
                                const selected = selectedPaymentMethod === method.code;
                                return (
                                    <button
                                        key={method.code}
                                        type="button"
                                        onClick={() => setSelectedPaymentMethod(method.code)}
                                        className={`w-full rounded-xl border p-4 text-left transition-all ${
                                            selected
                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                : "border-border hover:border-primary/40"
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-10 min-w-16 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold">
                                                {method.code === "COD" ? "COD" : method.code === "SAFEPAY" ? "ONLINE" : "MANUAL"}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold">{method.label}</p>
                                                <p className="text-sm text-muted-foreground">{method.description}</p>
                                            </div>
                                            {selected && <Check className="ml-auto h-5 w-5 text-primary" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedMethod && (
                            <div className="mt-4 rounded-xl border border-border/60 bg-background/50 p-4">
                                <p className="text-sm font-semibold">How this payment works</p>
                                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                                    {selectedMethod.details.map((detail) => (
                                        <p key={detail}>{detail}</p>
                                    ))}
                                </div>
                                {selectedPaymentMethod === "SAFEPAY" && (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        You will be redirected to Safepay to complete the payment securely and then returned to PakNutrition.
                                    </p>
                                )}
                                {selectedMethod.requires_reference && (
                                    <div className="mt-4 space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="payment_reference">{selectedMethod.reference_label}</Label>
                                            <Input
                                                id="payment_reference"
                                                value={paymentReference}
                                                onChange={(e) => setPaymentReference(e.target.value)}
                                                placeholder="Enter the transaction reference used for this payment"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="payment_note">Payment Note (Optional)</Label>
                                            <Textarea
                                                id="payment_note"
                                                value={paymentNote}
                                                onChange={(e) => setPaymentNote(e.target.value)}
                                                placeholder="Add sender name, wallet number, or any note to help verify the payment"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>

                {/* Order Summary */}
                <div className="lg:col-span-1">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm sticky top-24">
                        <h3 className="font-heading text-xl font-bold mb-6">Order Summary</h3>

                        <div className="space-y-4 mb-6">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal</span>
                                <span className="text-foreground font-medium">PKR {cartTotal.toLocaleString()}</span>
                            </div>
                            {discount > 0 && (
                                <div className="flex justify-between text-green-400">
                                    <span>Promo Discount {promoPreview?.code ? `(${promoPreview.code})` : ""}</span>
                                    <span>-PKR {discount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-muted-foreground">
                                <span>Shipping</span>
                                <span className="text-foreground font-medium">{shipping === 0 ? "Free" : `PKR ${shipping}`}</span>
                            </div>
                            <div className="h-px bg-border" />
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span className="text-primary">PKR {finalTotal.toLocaleString()}</span>
                            </div>
                        </div>

                        <Button
                            size="lg"
                            className="w-full text-lg font-bold shadow-glow hover:shadow-lg transition-all rounded-xl"
                            onClick={handlePlaceOrder}
                            disabled={placingOrder}
                        >
                            {placingOrder ? (
                                <>
                                    <Loader size={20} className="mr-2" />
                                    Processing...
                                </>
                            ) : (
                                selectedPaymentMethod === "SAFEPAY" ? "Continue to Secure Payment" : "Place Order"
                            )}
                        </Button>

                        <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <Truck className="w-4 h-4" />
                                Standard Delivery (2-4 Working Days)
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Checkout;
