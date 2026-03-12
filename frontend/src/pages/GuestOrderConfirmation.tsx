import { Link, useLocation, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";

const GuestOrderConfirmation = () => {
    const location = useLocation();
    const order = location.state?.order;

    if (!order) {
        return <Navigate to="/guest-orders" replace />;
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader
                title="Order Confirmed"
                description="Your guest order has been placed successfully."
            />

            <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">Reference Number</p>
                <p className="mt-2 font-heading text-5xl font-bold text-primary">#{order.id}</p>
                <p className="mt-4 text-muted-foreground">
                    Save this reference. You can track your order later using your email or phone number.
                </p>

                <div className="mt-8 grid gap-4 rounded-xl border border-border bg-background p-6 text-left">
                    <div>
                        <p className="text-sm text-muted-foreground">Customer</p>
                        <p className="font-medium">{order.guest_name}</p>
                        <p className="text-sm text-muted-foreground">{order.guest_email}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Delivery Address</p>
                        <p>{order.shipping_address}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Total</p>
                        <p className="font-bold">PKR {Number(order.total_amount).toLocaleString()}</p>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link to="/guest-orders">
                        <Button variant="outline">Track This Order</Button>
                    </Link>
                    <Link to="/products">
                        <Button>Continue Shopping</Button>
                    </Link>
                </div>

                <p className="mt-6 text-sm text-muted-foreground">
                    Need help? Contact support and share reference <strong>#{order.id}</strong>.
                </p>
            </div>
        </div>
    );
};

export default GuestOrderConfirmation;
