import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
const queryClient = new QueryClient();

import { AuthProvider } from "@/context/AuthContext";

import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Loader from "@/components/Loader";

const AuthRedirect = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  if (loading) return null; // Or a loader
  if (user) return <Navigate to="/" replace />;
  return children;
};

import ScrollToTop from "./components/ScrollToTop";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const ProductForm = lazy(() => import("./pages/admin/ProductForm"));
const AdminCategories = lazy(() => import("./pages/admin/Categories"));
const AdminPromotions = lazy(() => import("./pages/admin/Promotions"));
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminHomepageSettings = lazy(() => import("./pages/admin/HomepageSettings"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const ProductList = lazy(() => import("./pages/ProductList"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const Deals = lazy(() => import("./pages/Deals"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Shipping = lazy(() => import("./pages/Shipping"));
const Returns = lazy(() => import("./pages/Returns"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetails = lazy(() => import("./pages/OrderDetails"));
const Profile = lazy(() => import("./pages/Profile"));
const GuestOrderLookup = lazy(() => import("./pages/GuestOrderLookup"));
const GuestOrderConfirmation = lazy(() => import("./pages/GuestOrderConfirmation"));

const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <Loader size={36} />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Layout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/products" element={<ProductList />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/deals" element={<Deals />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/shipping" element={<Shipping />} />
                <Route path="/returns" element={<Returns />} />
                <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
                <Route path="/register" element={<AuthRedirect><Register /></AuthRedirect>} />
                <Route path="/forgot-password" element={<AuthRedirect><ForgotPassword /></AuthRedirect>} />
                <Route path="/reset-password/:uid/:token" element={<AuthRedirect><ResetPassword /></AuthRedirect>} />
                <Route path="/products/:slug" element={<ProductDetails />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/guest-orders" element={<GuestOrderLookup />} />
                <Route path="/guest-order-confirmation" element={<GuestOrderConfirmation />} />
                <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                <Route path="/orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/admin/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
                <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
                <Route path="/admin/products/add" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
                <Route path="/admin/products/edit/:id" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
                <Route path="/admin/categories" element={<ProtectedRoute><AdminCategories /></ProtectedRoute>} />
                <Route path="/admin/promotions" element={<ProtectedRoute><AdminPromotions /></ProtectedRoute>} />
                <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
                <Route path="/admin/customers" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
                <Route path="/admin/homepage" element={<ProtectedRoute><AdminHomepageSettings /></ProtectedRoute>} />
                <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Layout>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
