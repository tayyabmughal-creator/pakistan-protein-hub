import Hero from "@/components/Hero";
import Features from "@/components/Features";
import FeaturedProducts from "@/components/FeaturedProducts";
import Categories from "@/components/Categories";
import DealBanner from "@/components/DealBanner";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <Features />
      <FeaturedProducts />
      <Categories />
      <DealBanner />
    </div>
  );
};

export default Index;
