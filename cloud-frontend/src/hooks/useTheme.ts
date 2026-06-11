import { useState, useEffect } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }, []);

  const toggleTheme = async () => {
    // No-op - Mode gelap dinonaktifkan
  };

  return { theme, setTheme, toggleTheme };
}
