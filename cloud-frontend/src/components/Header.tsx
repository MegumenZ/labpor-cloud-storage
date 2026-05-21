import { useState, useEffect, useRef } from "react";
import { Search, LogOut, Trash2, Sun, Moon } from "lucide-react";

interface HeaderProps {
  onLogout?: () => void;
  onSearch: (query: string) => void;
  searchQuery?: string;
  title?: string;
  onEmptyTrash?: () => void;
  theme?: "light" | "dark";
  onThemeToggle?: () => void;
}

export function Header({
  onLogout,
  onSearch,
  searchQuery = "",
  title = "My Files",
  onEmptyTrash,
  theme = "light",
  onThemeToggle,
}: HeaderProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  // Sync local search when parent clears or changes the search query
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onSearch(val);
    }, 300); // 300ms debounce
  };

  return (
    <header className="grid grid-cols-3 items-center mb-6 gap-4 w-full select-none">
      {/* Left Column: Title & Dynamic Action Button */}
      <div className="flex items-center gap-4 min-w-0 justify-start">
        <h1 className="text-2xl font-bold tracking-tight text-foreground truncate" title={title}>
          {title}
        </h1>
        {title === "Trash" && onEmptyTrash && (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <Trash2 size={16} /> Empty Trash
          </button>
        )}
      </div>

      {/* Center Column: Steady Fixed Search Bar */}
      <div className="flex justify-center w-full min-w-0">
        <div className="relative w-full max-w-[400px] shrink-0">
          <Search className="absolute left-3.5 top-3 text-muted-foreground w-4.5 h-4.5" />
          <input
            type="text"
            placeholder="Search files..."
            value={localSearch}
            onChange={handleInputChange}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border text-foreground rounded-2xl focus:outline-none focus:ring-3 focus:ring-primary/15 focus:border-primary focus:shadow-md focus:shadow-primary/5 transition-all duration-300 text-sm font-medium"
          />
        </div>
      </div>

      {/* Right Column: Theme Toggle & Logout Button aligned right */}
      <div className="flex justify-end items-center gap-3.5 min-w-0">
        <button
          onClick={onThemeToggle}
          className="p-2.5 bg-card border border-border rounded-xl transition-all cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent/40 active:scale-95 flex items-center justify-center shrink-0 shadow-sm"
          title={theme === "dark" ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
        >
          {theme === "dark" ? (
            <Sun size={18} className="text-amber-500 animate-in spin-in-45 duration-500" />
          ) : (
            <Moon size={18} className="text-primary animate-in spin-in-45 duration-500" />
          )}
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer px-3.5 py-2.5 hover:bg-destructive/10 rounded-xl"
          >
            <LogOut size={18} /> Logout
          </button>
        )}
      </div>
    </header>
  );
}
