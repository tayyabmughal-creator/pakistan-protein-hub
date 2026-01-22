import ProductCard from "./ProductCard";
import wheyGold from "@/assets/products/whey-gold.png";
import massGainer from "@/assets/products/mass-gainer.png";
import preworkout from "@/assets/products/preworkout.png";
import bcaa from "@/assets/products/bcaa.png";
import creatine from "@/assets/products/creatine.png";
import nitrotech from "@/assets/products/nitrotech.png";
import iso100 from "@/assets/products/iso100.png";
import animalpak from "@/assets/products/animalpak.png";

const products = [
  {
    name: "Gold Standard 100% Whey Protein",
    brand: "Optimum Nutrition",
    price: 18999,
    originalPrice: 22999,
    rating: 5,
    image: wheyGold,
    badge: "Best Seller",
  },
  {
    name: "Serious Mass Weight Gainer",
    brand: "Optimum Nutrition",
    price: 14999,
    rating: 4,
    image: massGainer,
  },
  {
    name: "C4 Original Pre-Workout",
    brand: "Cellucor",
    price: 6999,
    originalPrice: 8499,
    rating: 5,
    image: preworkout,
    badge: "Hot Deal",
  },
  {
    name: "BCAA Energy Amino Acids",
    brand: "EVL Nutrition",
    price: 5499,
    rating: 4,
    image: bcaa,
  },
  {
    name: "Creatine Monohydrate",
    brand: "MuscleTech",
    price: 3999,
    rating: 5,
    image: creatine,
  },
  {
    name: "Nitro-Tech Whey Gold",
    brand: "MuscleTech",
    price: 16999,
    originalPrice: 19999,
    rating: 5,
    image: nitrotech,
    badge: "Premium",
  },
  {
    name: "ISO 100 Hydrolyzed Whey",
    brand: "Dymatize",
    price: 21999,
    rating: 5,
    image: iso100,
  },
  {
    name: "Animal Pak Multivitamin",
    brand: "Universal Nutrition",
    price: 7999,
    rating: 4,
    image: animalpak,
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
