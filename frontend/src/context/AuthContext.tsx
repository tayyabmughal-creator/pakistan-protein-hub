import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import apiClient from "@/lib/apiClient";

interface User {
    id: number;
    email: string;
    name: string;
    is_staff: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (access: string, refresh: string, user: User) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem("user");
        const token = localStorage.getItem("token");

        if (token && storedUser) {
            if (storedUser === "undefined") {
                localStorage.clear();
                setUser(null);
            } else {
                try {
                    setUser(JSON.parse(storedUser));
                } catch (e) {
                    console.error("Failed to parse user from storage", e);
                    localStorage.clear();
                }
            }
        }
        setLoading(false);
    }, []);

    const login = (access: string, refresh: string, userData: User) => {
        localStorage.setItem("token", access);
        localStorage.setItem("refreshToken", refresh);
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
    };

    const logout = async () => {
        const refresh = localStorage.getItem("refreshToken");

        // Clear storage immediately to prevent concurrent usage
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        setUser(null);

        if (refresh) {
            try {
                // Call backend logout to blacklist token - Fire and forget
                await apiClient.post("/users/logout", { refresh });
            } catch (error) {
                console.error("Logout failed:", error);
            }
        }

        window.location.href = "/";
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
