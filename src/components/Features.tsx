import { Truck, Shield, CreditCard, Headphones } from "lucide-react";

const features = [
  {
    icon: Truck,
    title: "Free Delivery",
    description: "Free shipping on orders above PKR 5,000 across Pakistan",
  },
  {
    icon: Shield,
    title: "100% Authentic",
    description: "All products are imported with verified authenticity seals",
  },
  {
    icon: CreditCard,
    title: "COD Available",
    description: "Cash on delivery available in all major cities",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    description: "Expert support available via WhatsApp anytime",
  },
];

const Features = () => {
  return (
    <section className="py-16 bg-background border-y border-border">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="flex items-start gap-4 group">
              <div className="flex-shrink-0 w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-foreground mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
