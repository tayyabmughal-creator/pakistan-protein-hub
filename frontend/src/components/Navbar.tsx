import { ShoppingCart, Menu, Search, User, LayoutDashboard, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="font-heading font-bold text-primary-foreground text-xl">P</span>
            </div>
            <span className="font-heading text-xl md:text-2xl font-bold text-foreground tracking-wide">
              POWER<span className="text-primary">FUEL</span>
            </span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#products" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              Products
            </a>
            <a href="#categories" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              Categories
            </a>
            <a href="#deals" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              Deals
            </a>
            <a href="#about" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              About
            </a>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            {user?.is_staff && (
              <a href="/admin">
                <Button variant="outline" size="sm" className="hidden md:flex gap-2">
                  <LayoutDashboard className="w-4 h-4" />
                  Admin
                </Button>
              </a>
            )}

            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
              <Search className="w-5 h-5" />
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary relative">
                    <User className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer">Profile</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">Orders</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <a href="/">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                  <User className="w-5 h-5" />
                </Button>
              </a>
            )}

            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-primary">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                0
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-muted-foreground"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-4">
              {user?.is_staff && (
                <a href="/admin" className="font-heading text-sm uppercase tracking-wider text-primary font-bold hover:text-primary/80 transition-colors flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4" />
                  Admin Panel
                </a>
              )}
              <a href="#products" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                Products
              </a>
              <a href="#categories" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                Categories
              </a>
              <a href="#deals" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                Deals
              </a>
              <a href="#about" className="font-heading text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                About
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
