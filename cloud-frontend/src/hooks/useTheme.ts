import { useState, useEffect } from "react";
import api from "../api";
import { toast } from "sonner";

export function useTheme(isAuthenticated: boolean) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [theme]);

  const toggleTheme = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);

    if (isAuthenticated) {
      try {
        await api.put("/auth/theme", { theme: nextTheme });
      } catch (err) {
        console.error("Gagal menyimpan preferensi tema ke server:", err);
        setTheme(theme); // Rollback on failure
        toast.error("Gagal menyimpan preferensi tema ke server");
      }
    }
  };

  return { theme, setTheme, toggleTheme };
}
