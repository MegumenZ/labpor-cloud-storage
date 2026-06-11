import { Home as HomeIcon, ChevronRight } from "lucide-react";

interface BreadcrumbsProps {
  items: { id: string; name: string }[];
  onNavigate: (targetId: string | null, index: number) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  const isHomeActive = items.length === 0;

  return (
    <div className="flex items-center gap-1.5 mb-6 text-sm text-muted-foreground bg-card/60 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-border/55 w-fit max-w-full overflow-x-auto no-scrollbar shadow-sm hover:shadow-md transition-all duration-300 select-none">
      <button
        onClick={() => onNavigate(null, -1)}
        className={`flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shrink-0 ${
          isHomeActive
            ? "text-primary font-bold bg-primary/10 px-3 py-1 rounded-xl border border-primary/20 shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-accent px-2.5 py-1 rounded-xl"
        }`}
      >
        <HomeIcon size={15} className={isHomeActive ? "text-primary animate-pulse" : "text-muted-foreground group-hover:text-primary transition-colors"} />
        <span>Home</span>
      </button>
      
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <div
            key={crumb.id}
            className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300 shrink-0"
          >
            <ChevronRight size={14} className="text-muted-foreground/30 shrink-0" />
            <button
              onClick={() => onNavigate(crumb.id, index)}
              className={`transition-all duration-200 max-w-[160px] truncate cursor-pointer font-medium hover:scale-[1.02] active:scale-[0.98] shrink-0 ${
                isLast
                  ? "text-primary font-bold bg-primary/10 px-3 py-1 rounded-xl border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent px-2.5 py-1 rounded-xl"
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
