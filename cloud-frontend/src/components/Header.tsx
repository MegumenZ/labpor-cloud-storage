import { useState, useEffect, useRef } from "react";
import { Search, LogOut, Trash2 } from "lucide-react";

interface HeaderProps {
  onLogout?: () => void;
  onSearch: (query: string) => void;
  searchQuery?: string;
  title?: string;
  onEmptyTrash?: () => void;
}

export function Header({
  onLogout,
  onSearch,
  searchQuery = "",
  title = "My Files",
  onEmptyTrash,
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
    <header className="grid grid-cols-[1fr_auto_1fr] items-center mb-6 gap-4 w-full">
      {/* Left Column: Title & Dynamic Action Button */}
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="text-xl font-semibold text-slate-800 truncate" title={title}>
          {title}
        </h1>
        {title === "Trash" && onEmptyTrash && (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors shrink-0"
          >
            <Trash2 size={16} /> Empty Trash
          </button>
        )}
      </div>

      {/* Center Column: Steady Fixed Search Bar */}
      <div className="relative w-64 sm:w-80 md:w-96 lg:w-[400px] shrink-0">
        <Search className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search files..."
          value={localSearch}
          onChange={handleInputChange}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 focus:shadow-md focus:shadow-blue-500/5 transition-all duration-300"
        />
      </div>

      {/* Right Column: Logout Button aligned right */}
      <div className="flex justify-end min-w-0">
        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors shrink-0"
          >
            <LogOut size={18} /> Logout
          </button>
        )}
      </div>
    </header>
  );
}
