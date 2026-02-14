import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createAddress, deleteAddress } from "@/lib/api";
import { toast } from "sonner";
import { useState } from "react";
import Loader from "@/components/Loader";

interface AddressFormData {
    full_name: string;
    phone_number: string;
    city: string;
    area: string;
    street: string;
    is_default: boolean;
}

interface AddressFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const AddressForm = ({ onSuccess, onCancel }: AddressFormProps) => {
    const { register, handleSubmit, formState: { errors } } = useForm<AddressFormData>();
    const [loading, setLoading] = useState(false);

    const onSubmit = async (data: AddressFormData) => {
        try {
            setLoading(true);
            await createAddress(data);
            toast.success("Address added successfully");
            onSuccess();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || "Failed to add address");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-card p-6 rounded-xl border border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input id="full_name" {...register("full_name", { required: true })} placeholder="John Doe" />
                    {errors.full_name && <span className="text-destructive text-xs">Required</span>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="phone_number">Phone Number</Label>
                    <Input id="phone_number" {...register("phone_number", { required: true })} placeholder="0300 1234567" />
                    {errors.phone_number && <span className="text-destructive text-xs">Required</span>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" {...register("city", { required: true })} placeholder="Lahore" />
                    {errors.city && <span className="text-destructive text-xs">Required</span>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="area">Area</Label>
                    <Input id="area" {...register("area", { required: true })} placeholder="DHA Phase 6" />
                    {errors.area && <span className="text-destructive text-xs">Required</span>}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>
                <Textarea id="street" {...register("street", { required: true })} placeholder="House #123, Street 4" />
                {errors.street && <span className="text-destructive text-xs">Required</span>}
            </div>

            <div className="flex items-center space-x-2">
                <Checkbox id="is_default" {...register("is_default")} />
                <Label htmlFor="is_default">Set as default address</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader size={16} /> : "Save Address"}
                </Button>
            </div>
        </form>
    );
};

export default AddressForm;
