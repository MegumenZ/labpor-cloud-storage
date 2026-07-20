import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import App from "../App";
import Login from "../Login";
import { useAuth } from "../hooks/useAuth";
import api from "../api";
import { useEffect } from "react";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthWrapper />
    </BrowserRouter>
  );
}

function AuthWrapper() {
  const auth = useAuth();
  const { isAuthenticated, authLoading, login } = auth;
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated && window.location.pathname !== "/login") {
        navigate("/login");
      } else if (isAuthenticated && window.location.pathname === "/login") {
        navigate("/");
      }
    }
  }, [isAuthenticated, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400 bg-background">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <Login 
            onLoginSuccess={(u, userData) => {
              if (userData) {
                login(u, userData);
                navigate("/");
              } else {
                api.get("/auth/me").then((res) => {
                  if (res.data.authenticated) {
                    login(u, res.data.user);
                    navigate("/");
                  }
                }).catch(() => {
                  login(u, { username: u });
                  navigate("/");
                });
              }
            }} 
          />
        } 
      />
      <Route 
        path="/*" 
        element={
          <App auth={auth} />
        } 
      />
    </Routes>
  );
}
