import { useEffect, useState } from "react";
import { User, MapPin, LogOut, Plus, Trash2, Edit } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchAddresses, deleteAddress } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import AddressForm from "@/components/AddressForm";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface Address {
    id: number;
    full_name: string;
    phone_number: string;
    city: string;
    area: string;
    street: string;
    is_default: boolean;
}

const Profile = () => {
    const { user, logout } = useAuth();
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddressForm, setShowAddressForm] = useState(false);

    // We reuse the address load logic
    const loadAddresses = async () => {
        try {
            const data = await fetchAddresses();
            setAddresses(data);
        } catch (error) {
            toast.error("Failed to load addresses");
        }
    };

    useEffect(() => {
        if (user) {
            setLoading(true);
            loadAddresses().finally(() => setLoading(false));
        }
    }, [user]);

    const handleDeleteAddress = async (id: number) => {
        if (!confirm("Delete this address?")) return;
        try {
            await deleteAddress(id);
            setAddresses(addresses.filter(a => a.id !== id));
            toast.success("Address deleted");
        } catch (error) {
            toast.error("Failed to delete address");
        }
    };

    const handleAddressAdded = () => {
        setShowAddressForm(false);
        loadAddresses();
    };

    if (loading) return <div className="py-20 flex justify-center"><Loader size={40} /></div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title="My Profile" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* User Info */}
                <div className="md:col-span-1">
                    <div className="bg-card border border-border rounded-xl p-6 mb-6">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                                <User className="w-10 h-10 text-primary" />
                            </div>
                            <h2 className="font-heading font-bold text-xl">{user?.name}</h2>
                            <p className="text-muted-foreground">{user?.email}</p>

                            <div className="mt-8 w-full space-y-3">
                                <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={logout}>
                                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Addresses */}
                <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-heading font-bold text-xl flex items-center gap-2">
                            <MapPin className="text-primary" /> Saved Addresses
                        </h2>
                        <Dialog open={showAddressForm} onOpenChange={setShowAddressForm}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <Plus className="w-4 h-4 mr-2" /> Add New
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Address</DialogTitle>
                                </DialogHeader>
                                <AddressForm onSuccess={handleAddressAdded} onCancel={() => setShowAddressForm(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-4">
                        {addresses.length === 0 ? (
                            <div className="text-center py-10 bg-card border border-border border-dashed rounded-xl">
                                <p className="text-muted-foreground">No addresses saved yet.</p>
                            </div>
                        ) : (
                            addresses.map((addr) => (
                                <div key={addr.id} className="bg-card border border-border rounded-xl p-6 relative group hover:border-primary/50 transition-colors">
                                    {addr.is_default && (
                                        <span className="absolute top-4 right-4 bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded">
                                            Default
                                        </span>
                                    )}
                                    <div className="pr-12">
                                        <h3 className="font-bold">{addr.full_name}</h3>
                                        <p className="text-muted-foreground">{addr.street}</p>
                                        <p className="text-muted-foreground">{addr.area}, {addr.city}</p>
                                        <p className="text-sm mt-2 font-medium">{addr.phone_number}</p>
                                    </div>
                                    <div className="flex gap-2 mt-4 md:mt-0 md:absolute md:bottom-4 md:right-4 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteAddress(addr.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
