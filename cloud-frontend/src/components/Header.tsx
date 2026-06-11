import { useState, useEffect, useRef } from "react";
import { Search, LogOut, Trash2, Menu } from "lucide-react";

interface HeaderProps {
  onLogout?: () => void;
  onSearch: (query: string) => void;
  searchQuery?: string;
  title?: string;
  onEmptyTrash?: () => void;
  onToggleSidebar?: () => void;
}

export function Header({
  onLogout,
  onSearch,
  searchQuery = "",
  title = "My Files",
  onEmptyTrash,
  onToggleSidebar,
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
    <header className="flex flex-col md:grid md:grid-cols-3 md:items-center mb-6 gap-4 w-full select-none">
      {/* Top Row on Mobile: Toggle Sidebar, Title, Theme, Logout */}
      <div className="flex items-center justify-between md:col-span-1 min-w-0 gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Hamburger Menu Trigger for Mobile */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2.5 bg-card border border-border rounded-xl hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer md:hidden shadow-sm shrink-0"
              title="Buka Menu"
            >
              <Menu size={18} />
            </button>
          )}
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate" title={title}>
            {title}
          </h1>
          {title === "Trash" && onEmptyTrash && (
            <button
              onClick={onEmptyTrash}
              className="flex items-center gap-2 px-3 py-1.5 text-xs md:text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <Trash2 size={15} /> <span className="hidden sm:inline">Empty Trash</span>
            </button>
          )}
        </div>

        {/* Mobile-only Quick settings aligned right */}
        <div className="flex items-center gap-2 md:hidden">

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2.5 bg-card border border-border rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 cursor-pointer flex items-center justify-center shadow-sm"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Center Column: Search Bar (Full-width on mobile, centered max-width on desktop) */}
      <div className="flex md:justify-center w-full min-w-0 md:col-span-1">
        <div className="relative w-full max-w-full md:max-w-[400px] shrink-0">
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

      {/* Desktop Right Column: Theme Toggle & Logout Button (Hidden on Mobile) */}
      <div className="hidden md:flex justify-end items-center gap-3.5 min-w-0 md:col-span-1">

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
