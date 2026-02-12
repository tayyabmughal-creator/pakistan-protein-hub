import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { createProduct, updateProduct, fetchAdminCategories, fetchAdminProducts } from "@/lib/api";
import { Upload, X } from "lucide-react";

const ProductForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdit = !!id;

    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        brand: "",
        category_id: "",
        price: "",
        discount_price: "",
        stock: "0",
        weight: "",
        description: "",
    });
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const cats = await fetchAdminCategories();
                setCategories(cats);

                if (isEdit) {
                    const products = await fetchAdminProducts();
                    const product = products.find((p: any) => p.id === parseInt(id));
                    if (product) {
                        setFormData({
                            name: product.name,
                            brand: product.brand,
                            category_id: product.category?.id?.toString() || "",
                            price: product.price,
                            discount_price: product.discount_price || "",
                            stock: product.stock.toString(),
                            weight: product.weight,
                            description: product.description,
                        });
                        if (product.image) setPreview(product.image);
                    }
                }
            } catch (error) {
                toast.error("Failed to initialize form");
            }
        };
        init();
    }, [id, isEdit]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImage(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const data = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
            if (value) data.append(key, value);
        });
        if (image) data.append("image", image);

        try {
            if (isEdit) {
                await updateProduct(parseInt(id), data);
                toast.success("Product updated successfully");
            } else {
                await createProduct(data);
                toast.success("Product created successfully");
            }
            navigate("/admin/products");
        } catch (error) {
            toast.error(isEdit ? "Failed to update product" : "Failed to create product");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout title={isEdit ? "Edit Product" : "Add New Product"}>
            <form onSubmit={handleSubmit} className="max-w-4xl space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="bg-card-gradient border-border">
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Product Name</Label>
                                <Input id="name" value={formData.name} onChange={handleInputChange} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="brand">Brand</Label>
                                <Input id="brand" value={formData.brand} onChange={handleInputChange} required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price (PKR)</Label>
                                    <Input id="price" type="number" value={formData.price} onChange={handleInputChange} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="discount_price">Discount Price</Label>
                                    <Input id="discount_price" type="number" value={formData.discount_price} onChange={handleInputChange} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="stock">Stock Quantity</Label>
                                    <Input id="stock" type="number" value={formData.stock} onChange={handleInputChange} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="weight">Weight (e.g. 2kg)</Label>
                                    <Input id="weight" value={formData.weight} onChange={handleInputChange} required />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select
                                    value={formData.category_id}
                                    onValueChange={(val) => setFormData({ ...formData, category_id: val })}
                                >
                                    <SelectTrigger className="bg-background">
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card-gradient border-border">
                        <CardContent className="pt-6 space-y-6">
                            <div className="space-y-2">
                                <Label>Product Image</Label>
                                <div className="relative aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center bg-secondary/20 overflow-hidden group">
                                    {preview ? (
                                        <>
                                            <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                                            <button
                                                type="button"
                                                onClick={() => { setImage(null); setPreview(null); }}
                                                className="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                                            <p className="text-sm text-muted-foreground">Click to upload or drag & drop</p>
                                            <input
                                                type="file"
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                onChange={handleImageChange}
                                                accept="image/*"
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" value={formData.description} onChange={handleInputChange} rows={6} required />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex gap-4">
                    <Button type="submit" size="lg" className="px-10 shadow-glow" disabled={loading}>
                        {loading ? "Saving..." : isEdit ? "Update Product" : "Create Product"}
                    </Button>
                    <Button type="button" variant="outline" size="lg" onClick={() => navigate("/admin/products")}>
                        Cancel
                    </Button>
                </div>
            </form>
        </AdminLayout>
    );
};

export default ProductForm;
