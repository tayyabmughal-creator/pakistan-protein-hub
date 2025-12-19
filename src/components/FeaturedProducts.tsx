import ProductCard from "./ProductCard";

const products = [
  {
    name: "Gold Standard 100% Whey Protein",
    brand: "Optimum Nutrition",
    price: 18999,
    originalPrice: 22999,
    rating: 5,
    image: "🥛",
    badge: "Best Seller",
  },
  {
    name: "Serious Mass Weight Gainer",
    brand: "Optimum Nutrition",
    price: 14999,
    rating: 4,
    image: "💪",
  },
  {
    name: "C4 Original Pre-Workout",
    brand: "Cellucor",
    price: 6999,
    originalPrice: 8499,
    rating: 5,
    image: "⚡",
    badge: "Hot Deal",
  },
  {
    name: "BCAA Energy Amino Acids",
    brand: "EVL Nutrition",
    price: 5499,
    rating: 4,
    image: "🔥",
  },
  {
    name: "Creatine Monohydrate",
    brand: "MuscleTech",
    price: 3999,
    rating: 5,
    image: "💊",
  },
  {
    name: "Nitro-Tech Whey Gold",
    brand: "MuscleTech",
    price: 16999,
    originalPrice: 19999,
    rating: 5,
    image: "🏆",
    badge: "Premium",
  },
  {
    name: "ISO 100 Hydrolyzed Whey",
    brand: "Dymatize",
    price: 21999,
    rating: 5,
    image: "⭐",
  },
  {
    name: "Animal Pak Multivitamin",
    brand: "Universal Nutrition",
    price: 7999,
    rating: 4,
    image: "🦁",
  },
];

const FeaturedProducts = () => {
  return (
    <section id="products" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-foreground mb-4">
            FEATURED <span className="text-gradient">PRODUCTS</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Premium supplements from world-renowned brands. All products are 100% authentic with verified seals.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product, index) => (
            <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
              <ProductCard {...product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
