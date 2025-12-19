import { ArrowRight } from "lucide-react";

const categories = [
  {
    name: "Whey Protein",
    count: 45,
    icon: "🥛",
    color: "from-primary/20 to-primary/5",
  },
  {
    name: "Mass Gainers",
    count: 28,
    icon: "💪",
    color: "from-orange-500/20 to-orange-500/5",
  },
  {
    name: "Pre-Workout",
    count: 32,
    icon: "⚡",
    color: "from-yellow-500/20 to-yellow-500/5",
  },
  {
    name: "BCAAs & Aminos",
    count: 24,
    icon: "🔥",
    color: "from-red-500/20 to-red-500/5",
  },
  {
    name: "Creatine",
    count: 18,
    icon: "💊",
    color: "from-blue-500/20 to-blue-500/5",
  },
  {
    name: "Vitamins",
    count: 36,
    icon: "🌿",
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
              className="group relative bg-card rounded-2xl border border-border p-6 text-center hover:border-primary/50 transition-all duration-300 overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-b ${category.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              
              <div className="relative z-10">
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">
                  {category.icon}
                </div>
                <h3 className="font-heading font-bold text-foreground mb-1">{category.name}</h3>
                <p className="text-xs text-muted-foreground">{category.count} Products</p>
                
                <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="inline-flex items-center text-primary text-sm font-medium">
                    Shop Now
                    <ArrowRight className="w-4 h-4 ml-1" />
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
