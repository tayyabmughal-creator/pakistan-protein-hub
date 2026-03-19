import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAdminProducts, deleteProduct, getImageUrl } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const AdminProducts = () => {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const loadProducts = async () => {
        try {
            const data = await fetchAdminProducts();
            setProducts(data);
        } catch (error) {
            toast.error("Failed to load products");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, []);

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this product?")) return;

        try {
            await deleteProduct(id);
            toast.success("Product deleted successfully");
            loadProducts();
        } catch (error: any) {
            console.error("Delete Error:", error);
            const msg = error?.message || "Failed to delete product";
            toast.error(`Error: ${msg}`);
        }
    };

    return (
        <AdminLayout title="Products">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Button onClick={() => navigate("/admin/products/add")} className="gap-2 shadow-glow">
                    <Plus className="w-4 h-4" /> Add Product
                </Button>
            </div>

            {loading ? (
                <div className="rounded-xl border border-border bg-card-gradient px-4 py-10 text-center md:hidden">
                    Loading products...
                </div>
            ) : products.length === 0 ? (
                <div className="rounded-xl border border-border bg-card-gradient px-4 py-10 text-center md:hidden">
                    No products found.
                </div>
            ) : (
                <div className="space-y-4 md:hidden">
                    {products.map((product, index) => (
                        <div key={product.id} className="rounded-2xl border border-border bg-card-gradient p-4">
                            <div className="flex items-start gap-3">
                                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/50">
                                    <img
                                        src={getImageUrl(product.image) || "/placeholder.png"}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Product #{index + 1}</p>
                                    <p className="mt-1 font-semibold">{product.name}</p>
                                    <p className="text-sm text-muted-foreground">{product.category?.name || "Uncategorized"}</p>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl border border-border/60 px-3 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Price</p>
                                    <p className="mt-1 font-semibold">Rs. {parseFloat(product.final_price).toLocaleString()}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 px-3 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Stock</p>
                                    <p className={`mt-1 font-semibold ${product.stock > 0 ? "text-green-500" : "text-destructive"}`}>
                                        {product.stock} units
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 gap-2 rounded-xl"
                                    onClick={() => navigate(`/admin/products/edit/${product.id}`)}
                                >
                                    <Edit className="w-4 h-4 text-primary" />
                                    Edit
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1 gap-2 rounded-xl text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(product.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="hidden overflow-hidden rounded-xl border border-border bg-card-gradient md:block">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead className="w-12">No.</TableHead>
                            <TableHead className="w-16">Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10">Loading products...</TableCell></TableRow>
                        ) : products.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10">No products found.</TableCell></TableRow>
                        ) : (
                            products.map((product, index) => (
                                <TableRow key={product.id} className="border-border hover:bg-secondary/30">
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>
                                        <div className="w-12 h-12 rounded-lg bg-secondary/50 overflow-hidden border border-border">
                                            <img
                                                src={getImageUrl(product.image) || "/placeholder.png"}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">{product.name}</TableCell>
                                    <TableCell>{product.category?.name || "N/A"}</TableCell>
                                    <TableCell>Rs. {parseFloat(product.final_price).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <span className={product.stock > 0 ? "text-green-500" : "text-destructive"}>
                                            {product.stock} units
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => navigate(`/admin/products/edit/${product.id}`)}
                                            >
                                                <Edit className="w-4 h-4 text-primary" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(product.id)}
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </AdminLayout>
    );
};

export default AdminProducts;
