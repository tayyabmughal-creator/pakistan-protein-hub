import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-[#050505] border-t border-white/10 pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="font-heading font-bold text-primary-foreground text-xl">P</span>
              </div>
              <span className="font-heading text-2xl font-bold text-white tracking-wide">
                POWER<span className="text-primary">FUEL</span>
              </span>
            </div>
            <p className="text-gray-400 mb-6">
              Pakistan's premium supplement store. Authentic products, best prices, and fastest delivery guaranteed.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-black transition-all">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-black transition-all">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-black transition-all">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-heading text-xl font-bold text-white mb-6">Quick Links</h3>
            <ul className="space-y-4">
              <li>
                <a href="/products" className="text-gray-400 hover:text-primary transition-colors">All Products</a>
              </li>
              <li>
                <a href="/categories" className="text-gray-400 hover:text-primary transition-colors">Categories</a>
              </li>
              <li>
                <a href="/deals" className="text-gray-400 hover:text-primary transition-colors">Deals & Offers</a>
              </li>
              <li>
                <a href="/about" className="text-gray-400 hover:text-primary transition-colors">About Us</a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-heading text-xl font-bold text-white mb-6">Support</h3>
            <ul className="space-y-4">
              <li>
                <a href="/contact" className="text-gray-400 hover:text-primary transition-colors">Contact Us</a>
              </li>
              <li>
                <a href="/faq" className="text-gray-400 hover:text-primary transition-colors">FAQs</a>
              </li>
              <li>
                <a href="/shipping" className="text-gray-400 hover:text-primary transition-colors">Shipping Policy</a>
              </li>
              <li>
                <a href="/returns" className="text-gray-400 hover:text-primary transition-colors">Returns & Refunds</a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-heading text-xl font-bold text-white mb-6">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-gray-400">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-1" />
                <span>Shop #12, Phase 6, DHA Lahore, Pakistan</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Phone className="w-5 h-5 text-primary shrink-0" />
                <span>+92 300 1234567</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Mail className="w-5 h-5 text-primary shrink-0" />
                <span>support@powerfuel.pk</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm">© {new Date().getFullYear()} PowerFuel. All rights reserved.</p>
          <div className="flex gap-4 opacity-50">
            {/* Payment Icons Placeholder */}
            <div className="h-6 w-10 bg-white/10 rounded"></div>
            <div className="h-6 w-10 bg-white/10 rounded"></div>
            <div className="h-6 w-10 bg-white/10 rounded"></div>
          </div>
        </div>
      </div>
    </footer>
  );
};


export default Footer;
