import { Home, ChevronRight } from "lucide-react";

interface BreadcrumbsProps {
  items: { id: string; name: string }[];
  onNavigate: (targetId: string | null, index: number) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  return (
    <div className="flex items-center gap-2 mb-8 text-sm text-slate-500 bg-white p-3 rounded-xl border w-fit shadow-sm">
      <button
        onClick={() => onNavigate(null, -1)}
        className={`flex items-center gap-1 hover:text-blue-600 transition-colors ${
          items.length === 0 ? "text-blue-600 font-bold" : ""
        }`}
      >
        <Home size={16} /> Home
      </button>
      {items.map((crumb, index) => (
        <div
          key={crumb.id}
          className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
        >
          <ChevronRight size={14} className="text-slate-300" />
          <button
            onClick={() => onNavigate(crumb.id, index)}
            className={`hover:text-blue-600 transition-colors max-w-[150px] truncate ${
              index === items.length - 1 ? "text-blue-600 font-bold" : ""
            }`}
          >
            {crumb.name}
          </button>
        </div>
      ))}
    </div>
  );
}
