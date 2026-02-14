import { Timer } from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const DealBanner = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 20,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    // Set target date to 20 days from now (persisted in local storage or just reset for demo)
    // For this specific request, I'll make it a 20 day countdown loop or just static 20 days decerementing.
    // Better approach: Set a fixed future date so it's consistent.

    // Let's use a standard countdown approach
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 20);

    const interval = setInterval(() => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();

      if (difference <= 0) {
        clearInterval(interval);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
              { value: timeLeft.days, label: "Days" },
              { value: timeLeft.hours, label: "Hours" },
              { value: timeLeft.minutes, label: "Mins" },
              { value: timeLeft.seconds, label: "Secs" },
            ].map((item, index) => (
              <div key={index} className="bg-secondary rounded-xl p-4 min-w-[80px]">
                <p className="font-heading text-3xl md:text-4xl font-bold text-primary">
                  {String(item.value).padStart(2, '0')}
                </p>
                <p className="text-xs text-muted-foreground uppercase">{item.label}</p>
              </div>
            ))}
          </div>

          <Link to="/deals">
            <Button size="lg" className="font-heading text-lg uppercase tracking-wider shadow-glow hover:shadow-[0_0_60px_hsl(84_81%_44%_/_0.5)] transition-all">
              Shop Sale Now
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default DealBanner;
