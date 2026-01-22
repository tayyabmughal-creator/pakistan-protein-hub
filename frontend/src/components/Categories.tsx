import { ArrowRight } from "lucide-react";
import wheyCategory from "@/assets/categories/whey.png";
import massCategory from "@/assets/categories/mass.png";
import preworkoutCategory from "@/assets/categories/preworkout.png";
import bcaaCategory from "@/assets/categories/bcaa.png";
import creatineCategory from "@/assets/categories/creatine.png";
import vitaminsCategory from "@/assets/categories/vitamins.png";

const categories = [
  {
    name: "Whey Protein",
    count: 45,
    image: wheyCategory,
    color: "from-primary/20 to-primary/5",
  },
  {
    name: "Mass Gainers",
    count: 28,
    image: massCategory,
    color: "from-orange-500/20 to-orange-500/5",
  },
  {
    name: "Pre-Workout",
    count: 32,
    image: preworkoutCategory,
    color: "from-yellow-500/20 to-yellow-500/5",
  },
  {
    name: "BCAAs & Aminos",
    count: 24,
    image: bcaaCategory,
    color: "from-red-500/20 to-red-500/5",
  },
  {
    name: "Creatine",
    count: 18,
    image: creatineCategory,
    color: "from-blue-500/20 to-blue-500/5",
  },
  {
    name: "Vitamins",
    count: 36,
    image: vitaminsCategory,
    color: "from-green-500/20 to-green-500/5",
  },
];

const Categories = () => {
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
          {categories.map((category, index) => (
            <a
              key={index}
              href="#"
              className="group relative bg-card rounded-2xl border border-border p-4 text-center hover:border-primary/50 transition-all duration-300 overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-b ${category.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              
              <div className="relative z-10">
                <div className="w-20 h-20 mx-auto mb-4 rounded-xl overflow-hidden group-hover:scale-110 transition-transform duration-300">
                  <img 
                    src={category.image} 
                    alt={category.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-heading font-bold text-foreground mb-1 text-sm">{category.name}</h3>
                <p className="text-xs text-muted-foreground">{category.count} Products</p>
                
                <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="inline-flex items-center text-primary text-xs font-medium">
                    Shop Now
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Categories;
