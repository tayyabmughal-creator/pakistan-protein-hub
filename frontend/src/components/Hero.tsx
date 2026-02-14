import { Zap, CheckCircle2 } from "lucide-react";
import heroProtein from "@/assets/hero-protein.png";

const Hero = () => {
  return (
    <section className="relative min-h-[90vh] bg-[#050505] overflow-hidden flex items-center pt-10">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050505_100%)]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Content */}
          <div className="animate-slide-up max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-full px-4 py-2 mb-8 backdrop-blur-sm">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              <span className="text-sm font-medium text-primary tracking-wide">Pakistan's #1 Supplement Store</span>
            </div>

            <h1 className="font-heading text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.9] mb-8 text-white">
              FUEL YOUR
              <span className="block text-primary">GAINS</span>
            </h1>

            <p className="text-lg md:text-xl text-gray-400 mb-10 leading-relaxed max-w-lg">
              Premium quality proteins & supplements delivered across Pakistan. 100% authentic products with COD available.
            </p>



            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 py-8 border-t border-white/10">
              <div>
                <p className="font-heading text-4xl font-bold text-primary mb-1">50K+</p>
                <p className="text-sm text-gray-400 font-medium">Happy Customers</p>
              </div>
              <div>
                <p className="font-heading text-4xl font-bold text-primary mb-1">100%</p>
                <p className="text-sm text-gray-400 font-medium">Authentic Products</p>
              </div>
              <div>
                <p className="font-heading text-4xl font-bold text-primary mb-1">24hr</p>
                <p className="text-sm text-gray-400 font-medium">Fast Delivery</p>
              </div>
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative hidden lg:block h-full">
            <div className="relative z-10 animate-float duration-[6s]">
              <div className="relative w-full aspect-square max-w-[600px] mx-auto">
                {/* Green glow behind image */}
                <div className="absolute inset-10 bg-primary/20 rounded-full blur-[80px] -z-10" />

                <img
                  src={heroProtein}
                  alt="Premium Protein Supplement"
                  className="w-full h-full object-contain drop-shadow-2xl"
                />

                {/* Floating Elements */}
                <div className="absolute -top-10 right-0 bg-[#1a1a1a]/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-xl animate-bounce-slow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-white font-bold">Verified</p>
                      <p className="text-xs text-gray-400">100% Authentic</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
