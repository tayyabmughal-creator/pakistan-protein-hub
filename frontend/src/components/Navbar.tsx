import { ShoppingCart, Menu, Search, User, LayoutDashboard, LogOut, X, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { fetchProducts, getImageUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// Hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch search results
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["search", debouncedSearch],
    queryFn: () => fetchProducts({ search: debouncedSearch }),
    enabled: debouncedSearch.length > 1, // Only search if 2+ chars
  });

  const { data: cartItems } = useQuery({
    queryKey: ["cart"],
    queryFn: async () => {
      const data = await import("@/lib/api").then(m => m.fetchCart());
      return data;
    },
    enabled: !!user, // Only fetch if user is logged in
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowResults(false);
      navigate(`/products?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="font-heading font-bold text-primary-foreground text-2xl">P</span>
            </div>
            <span className="font-heading text-2xl font-bold text-foreground tracking-tight">
              POWER<span className="text-primary">FUEL</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-10">
            <Link to="/products" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              Products
            </Link>
            <Link to="/categories" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              Categories
            </Link>
            <Link to="/deals" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              Deals
            </Link>
            <Link to="/about" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              About
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {user?.is_staff && (
              <a href="/admin">
                <Button variant="ghost" size="icon" className="hidden md:flex text-muted-foreground hover:text-primary">
                  <LayoutDashboard className="w-5 h-5" />
                </Button>
              </a>
            )}

            {/* Live Search Bar - Desktop */}
            <div className="relative hidden md:block" ref={searchRef}>
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                    placeholder="Search products..."
                    className="bg-white border border-gray-200 rounded-full py-2 pl-4 pr-10 text-sm text-black placeholder:text-gray-500 focus:outline-none focus:border-primary w-64 transition-all focus:w-80"
                  />
                  <div className="absolute right-3 top-2.5 text-gray-400">
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : searchQuery ? (
                      <X
                        className="w-4 h-4 cursor-pointer hover:text-white"
                        onClick={() => {
                          setSearchQuery("");
                          setShowResults(false);
                        }}
                      />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </form>

              {/* Search Results Dropdown */}
              {showResults && debouncedSearch.length > 1 && (
                <div className="absolute top-full mt-2 w-full bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-96 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-2">
                  {isSearching ? (
                    <div className="p-4 text-center text-gray-500 text-sm">Searching...</div>
                  ) : searchResults?.length > 0 ? (
                    <div>
                      <div className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-white/5">
                        Products
                      </div>
                      {searchResults.map((product: any) => (
                        <div
                          key={product.id}
                          onClick={() => {
                            navigate(`/products/${product.slug}`);
                            setShowResults(false);
                            setSearchQuery("");
                          }}
                          className="flex items-center gap-3 p-3 hover:bg-white/5 cursor-pointer transition-colors border-b border-white/5 last:border-0"
                        >
                          <div className="w-10 h-10 bg-black/40 rounded-lg p-1 flex-shrink-0">
                            <img src={getImageUrl(product.image) || "/placeholder.png"} alt={product.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white truncate">{product.name}</h4>
                            <p className="text-xs text-gray-400 truncate">{product.brand}</p>
                          </div>
                          <div className="text-primary text-sm font-bold whitespace-nowrap">
                            Rs. {Number(product.final_price).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={handleSearchSubmit}
                        className="w-full py-3 text-center text-sm text-primary hover:bg-white/5 font-medium border-t border-white/10 transition-colors"
                      >
                        View all results
                      </button>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-gray-400 text-sm">No products found for "{debouncedSearch}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground hover:text-primary">
              <Search className="w-5 h-5" />
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary relative">
                    <User className="w-5 h-5" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-background"></span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link to="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link to="/orders">Orders</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                  <User className="w-5 h-5" />
                </Button>
              </Link>
            )}

            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-primary">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center rounded-full">
                  {cartItems?.items?.reduce((total: number, item: any) => total + item.quantity, 0) || 0}
                </span>
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-muted-foreground"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border animate-slide-up bg-background">
            <div className="flex flex-col gap-4">
              {user?.is_staff && (
                <a href="/admin" className="font-heading text-sm uppercase tracking-wider text-primary font-bold hover:text-primary/80 transition-colors flex items-center gap-2 px-4 py-2">
                  <LayoutDashboard className="w-4 h-4" />
                  Admin Panel
                </a>
              )}
              <Link to="/products" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-4 py-2 hover:bg-muted/50 rounded-lg">
                Products
              </Link>
              <Link to="/categories" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-4 py-2 hover:bg-muted/50 rounded-lg">
                Categories
              </Link>
              <Link to="/deals" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-4 py-2 hover:bg-muted/50 rounded-lg">
                Deals
              </Link>
              <Link to="/about" className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-4 py-2 hover:bg-muted/50 rounded-lg">
                About
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
