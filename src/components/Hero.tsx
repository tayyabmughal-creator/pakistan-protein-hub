import { ArrowRight, Zap } from "lucide-react";
import { Button } from "./ui/button";

const Hero = () => {
  return (
    <section className="relative min-h-screen bg-hero-gradient flex items-center pt-20">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-2 mb-6">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Pakistan's #1 Supplement Store</span>
            </div>
            
            <h1 className="font-heading text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-6">
              FUEL YOUR
              <span className="block text-gradient">GAINS</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-lg">
              Premium quality proteins & supplements delivered across Pakistan. 100% authentic products with COD available.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="font-heading text-lg uppercase tracking-wider shadow-glow hover:shadow-[0_0_60px_hsl(84_81%_44%_/_0.5)] transition-all">
                Shop Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button variant="outline" size="lg" className="font-heading text-lg uppercase tracking-wider border-muted-foreground/30 hover:border-primary hover:text-primary">
                View Deals
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-12 pt-8 border-t border-border">
              <div>
                <p className="font-heading text-3xl md:text-4xl font-bold text-primary">50K+</p>
                <p className="text-sm text-muted-foreground">Happy Customers</p>
              </div>
              <div>
                <p className="font-heading text-3xl md:text-4xl font-bold text-primary">100%</p>
                <p className="text-sm text-muted-foreground">Authentic Products</p>
              </div>
              <div>
                <p className="font-heading text-3xl md:text-4xl font-bold text-primary">24hr</p>
                <p className="text-sm text-muted-foreground">Fast Delivery</p>
              </div>
            </div>
          </div>

          {/* Image Placeholder */}
          <div className="relative hidden lg:block">
            <div className="relative z-10 animate-float">
              <div className="w-full aspect-square bg-card-gradient rounded-3xl border border-border flex items-center justify-center overflow-hidden">
                <div className="text-center p-8">
                  <div className="w-48 h-48 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
                    <span className="font-heading text-6xl font-bold text-primary">💪</span>
                  </div>
                  <p className="font-heading text-2xl font-bold text-foreground">Premium Whey</p>
                  <p className="text-muted-foreground">Starting from PKR 8,999</p>
                </div>
              </div>
            </div>
            <div className="absolute -top-4 -right-4 w-full h-full bg-primary/10 rounded-3xl -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
