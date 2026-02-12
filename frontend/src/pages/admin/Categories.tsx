import AdminLayout from "@/components/admin/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { fetchAdminCategories, createCategory, updateCategory, deleteCategory } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AdminCategories = () => {
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<any | null>(null);
    const [formData, setFormData] = useState({ name: "", slug: "" });
    const [saving, setSaving] = useState(false);

    const [imageFile, setImageFile] = useState<File | null>(null);

    const loadCategories = async () => {
        try {
            const data = await fetchAdminCategories();
            setCategories(data);
        } catch (error) {
            toast.error("Failed to load categories");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCategories();
    }, []);

    const handleOpenDialog = (category?: any) => {
        if (category) {
            setEditingCategory(category);
            setFormData({ name: category.name, slug: category.slug });
        } else {
            setEditingCategory(null);
            setFormData({ name: "", slug: "" });
        }
        setImageFile(null);
        setIsDialogOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const data = new FormData();
            data.append("name", formData.name);
            data.append("slug", formData.slug);
            if (imageFile) {
                data.append("image", imageFile);
            }

            if (editingCategory) {
                await updateCategory(editingCategory.id, data);
                toast.success("Category updated");
            } else {
                await createCategory(data);
                toast.success("Category created");
            }
            setIsDialogOpen(false);
            loadCategories();
        } catch (error: any) {
            console.error("Save Error:", error);
            const msg = error?.message || "Failed to save category";
            toast.error(`Error: ${msg}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure? This might affect products in this category.")) return;

        try {
            await deleteCategory(id);
            toast.success("Category deleted");
            loadCategories();
        } catch (error: any) {
            console.error("Delete Error:", error);
            const msg = error?.message || "Failed to delete category";
            toast.error(`Error: ${msg}`);
        }
    };

    // Auto-generate slug from name
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        const slug = name.toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");
        setFormData({ ...formData, name, slug });
    };

    const getImageUrl = (path: string | null) => {
        if (!path) return null;
        if (path.startsWith("http")) return path;
        // Fix relative paths
        const cleanPath = path.startsWith("/") ? path : `/${path}`;
        return `http://127.0.0.1:8000${cleanPath}`;
    };

    return (
        <AdminLayout title="Categories">
            <div className="flex justify-end mb-6">
                <Button onClick={() => handleOpenDialog()} className="gap-2 shadow-glow">
                    <Plus className="w-4 h-4" /> Add Category
                </Button>
            </div>

            <div className="bg-card-gradient border border-border rounded-xl overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead>No.</TableHead>
                            <TableHead>Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Slug</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10">Loading categories...</TableCell></TableRow>
                        ) : categories.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10">No categories found.</TableCell></TableRow>
                        ) : (
                            categories.map((cat, index) => (
                                <TableRow key={cat.id} className="border-border hover:bg-secondary/30">
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>
                                        <div className="w-10 h-10 rounded-md overflow-hidden bg-secondary/50 border border-border flex items-center justify-center">
                                            {cat.image ? (
                                                <img
                                                    src={getImageUrl(cat.image)!}
                                                    alt={cat.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">No Img</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">{cat.name}</TableCell>
                                    <TableCell>{cat.slug}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(cat)}>
                                                <Pencil className="w-4 h-4 text-primary" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(cat.id)}>
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

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px] bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>{editingCategory ? "Edit Category" : "Add New Category"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={formData.name} onChange={handleNameChange} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="slug">Slug</Label>
                            <Input id="slug" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="image">Image</Label>
                            <Input
                                id="image"
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setImageFile(e.target.files[0]);
                                    }
                                }}
                            />
                            {editingCategory?.image && !imageFile && (
                                <p className="text-xs text-muted-foreground">
                                    Current: {editingCategory.image.split("/").pop()}
                                </p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Category"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
};

export default AdminCategories;
