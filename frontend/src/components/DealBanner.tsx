import { Timer } from "lucide-react";
import { Button } from "./ui/button";

const DealBanner = () => {
  return (
    <section id="deals" className="py-20 bg-hero-gradient relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="bg-card-gradient rounded-3xl border border-primary/30 p-8 md:p-12 text-center animate-pulse-glow">
          <div className="inline-flex items-center gap-2 bg-primary/20 rounded-full px-4 py-2 mb-6">
            <Timer className="w-5 h-5 text-primary" />
            <span className="font-heading text-sm uppercase tracking-wider text-primary">Limited Time Offer</span>
          </div>

          <h2 className="font-heading text-4xl md:text-6xl font-bold text-foreground mb-4">
            MEGA <span className="text-gradient">SALE</span>
          </h2>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-2">
            Up to <span className="text-primary font-bold">50% OFF</span> on all proteins
          </p>
          
          <p className="text-muted-foreground mb-8">
            Use code: <span className="font-mono bg-primary/20 text-primary px-3 py-1 rounded-lg font-bold">POWER50</span>
          </p>

          {/* Countdown */}
          <div className="flex justify-center gap-4 mb-8">
            {[
              { value: "02", label: "Days" },
              { value: "14", label: "Hours" },
              { value: "36", label: "Mins" },
              { value: "52", label: "Secs" },
            ].map((item, index) => (
              <div key={index} className="bg-secondary rounded-xl p-4 min-w-[80px]">
                <p className="font-heading text-3xl md:text-4xl font-bold text-primary">{item.value}</p>
                <p className="text-xs text-muted-foreground uppercase">{item.label}</p>
              </div>
            ))}
          </div>

          <Button size="lg" className="font-heading text-lg uppercase tracking-wider shadow-glow hover:shadow-[0_0_60px_hsl(84_81%_44%_/_0.5)] transition-all">
            Shop Sale Now
          </Button>
        </div>
      </div>
    </section>
  );
};

export default DealBanner;
