import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { fetchCategories, getImageUrl } from "@/lib/api";
import { Skeleton } from "./ui/skeleton";

// Map slugs or indices to colors if not stored in DB
const CATEGORY_COLORS = [
  "from-primary/20 to-primary/5",
  "from-orange-500/20 to-orange-500/5",
  "from-yellow-500/20 to-yellow-500/5",
  "from-red-500/20 to-red-500/5",
  "from-blue-500/20 to-blue-500/5",
  "from-green-500/20 to-green-500/5",
];

const Categories = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const categories = (data || []).filter((category: any) =>
    !["Featured", "protein", "Protein"].includes(category.name)
  );

  if (error) {
    return null;
  }

  return (
    <section id="categories" className="py-20 bg-[#050505]">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
          <div>
            <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
              SHOP BY <span className="text-primary">CATEGORY</span>
            </h2>
            <p className="text-gray-400 max-w-xl text-lg">
              Find exactly what you need to achieve your fitness goals. Browse our extensive collection of premium supplements.
            </p>
          </div>
          <a href="/products" className="group flex items-center gap-2 font-heading font-bold text-lg text-white hover:text-primary transition-colors">
            VIEW ALL
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl bg-[#111]" />
            ))
          ) : (
            categories.map((category: any, index: number) => (
              <a
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="group relative bg-[#111] rounded-2xl border border-white/10 p-4 text-center hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-b ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                <div className="relative z-10">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-xl overflow-hidden group-hover:scale-110 transition-transform duration-300 bg-black/20 p-2">
                    <img
                      src={getImageUrl(category.image) || "/placeholder-cat.png"}
                      alt={category.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <h3 className="font-heading font-bold text-white mb-1 text-sm tracking-wide">{category.name}</h3>
                  {/* Removed product count as requested */}

                  <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="inline-flex items-center text-primary text-xs font-medium">
                      Shop Now
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </span>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default Categories;
