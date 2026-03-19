import { Facebook, Instagram, Mail, Phone, MapPin, Music2, Youtube } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchHomePageSettings } from "@/lib/api";

const Footer = () => {
  const { data: settings } = useQuery({
    queryKey: ["homepage-settings"],
    queryFn: fetchHomePageSettings,
  });

  const socialLinks = [
    { href: settings?.facebook_url, label: "Facebook", icon: Facebook },
    { href: settings?.instagram_url, label: "Instagram", icon: Instagram },
    { href: settings?.tiktok_url, label: "TikTok", icon: Music2 },
    { href: settings?.youtube_url, label: "YouTube", icon: Youtube },
  ].filter((item) => item.href);
  const supportPhone = settings?.support_phone?.trim() || "";
  const supportEmail = settings?.support_email?.trim() || "";

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
                Pak<span className="text-primary">Nutrition</span>
              </span>
            </div>
            <p className="text-gray-400 mb-6">
              PakNutrition is Pakistan's premium supplement store. Authentic products, honest pricing, and fast delivery.
            </p>
            {socialLinks.length > 0 && (
              <div className="flex gap-4">
                {socialLinks.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={item.label}
                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-black transition-all"
                  >
                    <item.icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
            )}
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
                <a href="/guest-orders" className="text-gray-400 hover:text-primary transition-colors">Track Guest Order</a>
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
              <li>
                <a href="/guest-orders" className="text-gray-400 hover:text-primary transition-colors">Guest Order Lookup</a>
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
              {supportPhone && (
                <li className="flex items-center gap-3 text-gray-400">
                  <Phone className="w-5 h-5 text-primary shrink-0" />
                  <a href={`tel:${supportPhone}`} className="hover:text-primary transition-colors">{supportPhone}</a>
                </li>
              )}
              {supportEmail && (
                <li className="flex items-center gap-3 text-gray-400">
                  <Mail className="w-5 h-5 text-primary shrink-0" />
                  <a href={`mailto:${supportEmail}`} className="hover:text-primary transition-colors">{supportEmail}</a>
                </li>
              )}
              {!supportPhone && !supportEmail && (
                <li className="text-gray-400">
                  <a href="/contact" className="hover:text-primary transition-colors">Use the contact form for support</a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm">© {new Date().getFullYear()} PakNutrition. All rights reserved.</p>
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
