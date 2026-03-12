import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { lookupGuestOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import Loader from "@/components/Loader";
import { toast } from "sonner";

const GuestOrderLookup = () => {
    const [orderId, setOrderId] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [order, setOrder] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setOrder(null);

        try {
            const data = await lookupGuestOrder({
                order_id: Number(orderId),
                email: email || undefined,
                phone_number: phoneNumber || undefined,
            });
            setOrder(data);
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Order not found");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader
                title="Track Guest Order"
                description="Enter your order reference and email or phone number."
            />

            <div className="grid gap-8 lg:grid-cols-2">
                <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
                    <div className="space-y-2">
                        <Label htmlFor="order_id">Order Reference</Label>
                        <Input id="order_id" value={orderId} onChange={(e) => setOrderId(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone_number">Phone Number</Label>
                        <Input id="phone_number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader size={16} /> : "Find Order"}
                    </Button>
                </form>

                <div className="rounded-xl border border-border bg-card p-6">
                    {!order ? (
                        <p className="text-muted-foreground">Order details will appear here after a successful lookup.</p>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Order Reference</p>
                                <p className="text-2xl font-heading font-bold">#{order.id}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Status</p>
                                <p className="font-bold text-primary">{order.status}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Customer</p>
                                <p>{order.guest_name}</p>
                                <p className="text-sm text-muted-foreground">{order.guest_email}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Delivery Address</p>
                                <p>{order.shipping_address}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Items</p>
                                <ul className="space-y-2">
                                    {order.items.map((item: any) => (
                                        <li key={item.id} className="flex justify-between text-sm">
                                            <span>{item.quantity} x {item.product_name}</span>
                                            <span>PKR {Number(item.price).toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8">
                <Link to="/products" className="text-primary hover:underline">Continue shopping</Link>
            </div>
        </div>
    );
};

export default GuestOrderLookup;
