import { Facebook, Instagram, MessageCircle, Phone, Mail, MapPin } from "lucide-react";

const Footer = () => {
  return (
    <footer id="about" className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="font-heading font-bold text-primary-foreground text-xl">P</span>
              </div>
              <span className="font-heading text-2xl font-bold text-foreground tracking-wide">
                POWER<span className="text-primary">FUEL</span>
              </span>
            </div>
            <p className="text-muted-foreground mb-6">
              Pakistan's trusted source for premium fitness supplements. 100% authentic products delivered to your doorstep.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center hover:bg-primary transition-colors group">
                <Facebook className="w-5 h-5 text-muted-foreground group-hover:text-primary-foreground" />
              </a>
              <a href="#" className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center hover:bg-primary transition-colors group">
                <Instagram className="w-5 h-5 text-muted-foreground group-hover:text-primary-foreground" />
              </a>
              <a href="#" className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center hover:bg-primary transition-colors group">
                <MessageCircle className="w-5 h-5 text-muted-foreground group-hover:text-primary-foreground" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground mb-4">Quick Links</h3>
            <ul className="space-y-3">
              {["Shop All", "Whey Protein", "Mass Gainers", "Pre-Workout", "Vitamins", "Deals"].map((link) => (
                <li key={link}>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground mb-4">Support</h3>
            <ul className="space-y-3">
              {["Track Order", "Shipping Info", "Returns & Refunds", "FAQs", "Privacy Policy", "Terms of Service"].map((link) => (
                <li key={link}>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground mb-4">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-foreground font-medium">+92 300 1234567</p>
                  <p className="text-sm text-muted-foreground">WhatsApp Available</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground">support@powerfuel.pk</p>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground">Lahore, Karachi, Islamabad<br />All Major Cities</p>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 PowerFuel Pakistan. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/124px-PayPal.svg.png" alt="PayPal" className="h-6 opacity-60" />
            <span className="text-muted-foreground text-sm">COD • EasyPaisa • JazzCash</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
