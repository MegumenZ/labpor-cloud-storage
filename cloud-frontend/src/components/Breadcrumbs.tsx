import { Home as HomeIcon, ChevronRight } from "lucide-react";

interface BreadcrumbsProps {
  items: { id: string; name: string }[];
  onNavigate: (targetId: string | null, index: number) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  const isHomeActive = items.length === 0;

  return (
    <div className="flex items-center gap-1.5 mb-6 text-sm text-slate-500 bg-white/75 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200/50 w-fit shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all duration-300 select-none">
      <button
        onClick={() => onNavigate(null, -1)}
        className={`flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
          isHomeActive
            ? "text-blue-600 font-semibold bg-blue-50/70 px-3 py-1 rounded-xl border border-blue-100/40 shadow-sm shadow-blue-500/5"
            : "text-slate-600 hover:text-blue-600 hover:bg-slate-50/80 px-2.5 py-1 rounded-xl"
        }`}
      >
        <HomeIcon size={15} className={isHomeActive ? "text-blue-500" : "text-slate-400 group-hover:text-blue-500 transition-colors"} />
        <span>Home</span>
      </button>
      
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <div
            key={crumb.id}
            className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300"
          >
            <ChevronRight size={14} className="text-slate-300 shrink-0" />
            <button
              onClick={() => onNavigate(crumb.id, index)}
              className={`transition-all duration-200 max-w-[160px] truncate cursor-pointer font-medium hover:scale-[1.02] active:scale-[0.98] ${
                isLast
                  ? "text-blue-600 font-semibold bg-blue-50/70 px-3 py-1 rounded-xl border border-blue-100/40 shadow-sm shadow-blue-500/5"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-50/80 px-2.5 py-1 rounded-xl"
              }`}
              title={crumb.name}
            >
              {crumb.name}
            </button>
          </div>
        );
      })}
    </div>
  );
}
