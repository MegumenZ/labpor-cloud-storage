import { Search, LogOut, Trash2 } from "lucide-react";

interface HeaderProps {
  onLogout?: () => void;
  onSearch: (query: string) => void;
  title?: string;
  onEmptyTrash?: () => void;
}

export function Header({ onLogout, onSearch, title = "My Files", onEmptyTrash }: HeaderProps) {
  return (
    <header className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        {title === "Trash" && onEmptyTrash && (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            <Trash2 size={16} /> Empty Trash
          </button>
        )}
      </div>

      <div className="relative w-full max-w-md mx-4">
        <Search className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search files..."
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} /> Logout
        </button>
      )}
    </header>
  );
}
