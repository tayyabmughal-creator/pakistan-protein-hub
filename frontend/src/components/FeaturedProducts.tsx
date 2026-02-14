import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProductCard from "./ProductCard";
import { fetchProducts, addToCart } from "@/lib/api";
import { Skeleton } from "./ui/skeleton";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const FeaturedProducts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  const addToCartMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) => addToCart(id, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      toast({
        title: "Added to cart",
        description: "Product has been added to your cart.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add product to cart. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = async (id: number) => {
    if (!user) {
      navigate("/login");
      return;
    }
    await addToCartMutation.mutateAsync({ id, quantity: 1 });
  };

  if (error) {
    return (
      <div className="text-center py-20 bg-[#050505]">
        <p className="text-destructive">Failed to load products. Please try again later.</p>
      </div>
    );
  }

  const products = data || [];
  return (
    <section id="products" className="py-20 bg-[#050505]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            FEATURED <span className="text-primary">PRODUCTS</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Premium supplements from world-renowned brands. All products are 100% authentic with verified seals.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[450px] w-full rounded-2xl bg-[#111]" />
            ))
          ) : products.length > 0 ? (
            products.map((product: any, index: number) => (
              <div key={product.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <ProductCard {...product} onAddToCart={handleAddToCart} />
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-10 text-gray-500">
              No products available at the moment.
            </div>
          )}
        </div>

        <div className="mt-16 text-center">
          <Link to="/products">
            <button className="h-12 px-8 font-heading text-lg tracking-wider rounded-lg border-2 border-primary/20 bg-transparent text-primary hover:bg-primary hover:text-black transition-all">
              VIEW ALL PRODUCTS
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
};
export default FeaturedProducts;
