import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

const ProtectedRoute = ({ children, requireStaff = false }: { children: JSX.Element; requireStaff?: boolean }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        // Redirect to login page with the return url
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requireStaff && !user.is_staff) {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
