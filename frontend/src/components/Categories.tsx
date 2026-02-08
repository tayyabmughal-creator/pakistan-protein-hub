import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { fetchCategories, getImageUrl } from "@/lib/api";
import { Skeleton } from "./ui/skeleton";

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

  if (error) return null;

  const categories = data || [];

  return (
    <section id="categories" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-foreground mb-4">
            SHOP BY <span className="text-gradient">CATEGORY</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Find exactly what you need for your fitness goals
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))
          ) : (
            categories.map((category: any, index: number) => (
              <a
                key={category.id}
                href={`#?category=${category.slug}`}
                className="group relative bg-card rounded-2xl border border-border p-4 text-center hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-b ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                <div className="relative z-10">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-xl overflow-hidden group-hover:scale-110 transition-transform duration-300">
                    <img
                      src={getImageUrl(category.image) || "/placeholder-cat.png"}
                      alt={category.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-heading font-bold text-foreground mb-1 text-sm">{category.name}</h3>

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
