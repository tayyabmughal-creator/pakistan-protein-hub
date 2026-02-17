import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register" || location.pathname === "/forgot-password" || location.pathname.startsWith("/reset-password");
  const isAdminPage = location.pathname.startsWith("/admin");

  // Show Navbar/Footer only if NOT auth page AND NOT admin page
  const showNavFooter = !isAuthPage && !isAdminPage;

  return (
    <div className="min-h-screen bg-background flex flex-col font-body">
      {showNavFooter && <Navbar />}
      <main className="flex-grow">
        {children}
      </main>
      {showNavFooter && <Footer />}
    </div>
  );
};

export default Layout;
