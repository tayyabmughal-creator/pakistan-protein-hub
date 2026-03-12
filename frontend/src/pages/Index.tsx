import { useQuery } from "@tanstack/react-query";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import FeaturedProducts from "@/components/FeaturedProducts";
import Categories from "@/components/Categories";
import DealBanner from "@/components/DealBanner";
import { fetchHomePageSettings } from "@/lib/api";

const Index = () => {
  const { data: settings } = useQuery({
    queryKey: ["homepage-settings"],
    queryFn: fetchHomePageSettings,
  });

  return (
    <div className="min-h-screen bg-background">
      <Hero settings={settings} />
      <Features />
      <FeaturedProducts />
      <Categories />
      <DealBanner settings={settings} />
    </div>
  );
};

export default Index;
