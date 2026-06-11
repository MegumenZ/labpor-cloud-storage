import { Cloud, Upload, Plus, LayoutGrid, Star, Trash2, HardDrive, X } from "lucide-react";
import { useRef } from "react";

interface SidebarProps {
  currentUser: string;
  displayName?: string;
  avatarUrl?: string | null;
  storageUsed: number;
  storageLimit: number;
  viewMode?: "files" | "trash" | "favorites";
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateFolder: () => void;
  onShowProfile: () => void;
  onChangeView?: (mode: "files" | "trash" | "favorites") => void;
  isStorageOnline?: boolean;
  onClose?: () => void;
}

const SidebarItem = ({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 py-3 rounded-xl font-bold transition-all duration-300 active:scale-[0.98] cursor-pointer border-l-4 ${active
      ? "bg-gradient-to-r from-sidebar-primary/15 to-transparent border-sidebar-primary text-sidebar-primary pl-3 shadow-none"
      : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:pl-5 pl-4"
      }`}
  >
    <span className={`transition-all duration-300 ${active ? "scale-110 text-sidebar-primary" : "text-sidebar-foreground/45 group-hover:text-sidebar-primary/70"}`}>
      {icon}
    </span>
    <span>{label}</span>
  </button>
);

export function Sidebar({
  currentUser,
  displayName,
  avatarUrl,
  storageUsed,
  storageLimit,
  viewMode = "files",
  onUpload,
  onCreateFolder,
  onShowProfile,
  onChangeView,
  isStorageOnline = true,
  onClose,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const percentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;

  return (
    <aside className="w-full h-full bg-sidebar flex flex-col shrink-0 select-none">
      <div className="p-6 flex items-center justify-between text-sidebar-primary">
        <div className="flex items-center gap-2">
          <Cloud size={32} strokeWidth={2.5} />
          <span className="text-xl font-extrabold tracking-tight">Labpro Storage</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg transition-all cursor-pointer"
            title="Tutup Menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* BAGIAN PROFILE YANG BISA DIKLIK */}
      <button
        onClick={onShowProfile}
        className="px-6 py-2 mb-6 flex items-center gap-3 w-full text-left hover:bg-sidebar-accent/80 transition-all duration-300 active:scale-[0.98] border-y border-transparent hover:border-sidebar-border cursor-pointer"
      >
        <div className="w-10 h-10 rounded-full bg-sidebar-primary/10 flex items-center justify-center text-sidebar-primary font-bold border border-sidebar-primary/20 overflow-hidden shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            (displayName || currentUser || "U").substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="overflow-hidden">
          <p className="text-sm font-bold text-sidebar-foreground truncate">
            {displayName || currentUser}
          </p>
          <p className="text-xs text-sidebar-foreground/50">Online</p>
        </div>
      </button>

      <div className="px-6 mb-6 space-y-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!isStorageOnline}
          className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold hover:bg-primary/95 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
        >
          <Upload size={20} /> Upload File
        </button>
        <button
          onClick={onCreateFolder}
          disabled={!isStorageOnline}
          className="w-full bg-card border border-border hover:border-primary/50 hover:text-primary hover:bg-primary/5 text-foreground py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] font-bold cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
        >
          <Plus size={20} /> New Folder
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={onUpload}
        />
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        <SidebarItem
          icon={<LayoutGrid size={20} />}
          label="My Files"
          active={viewMode === "files"}
          onClick={() => onChangeView?.("files")}
        />
        <SidebarItem
          icon={<Star size={20} />}
          label="Favorites"
          active={viewMode === "favorites"}
          onClick={() => onChangeView?.("favorites")}
        />
        <SidebarItem
          icon={<Trash2 size={20} />}
          label="Trash"
          active={viewMode === "trash"}
          onClick={() => onChangeView?.("trash")}
        />
      </nav>

      <div className="p-6 mt-auto border-t border-sidebar-border/40">
        <div className="bg-sidebar-accent/50 p-4 rounded-2xl border border-sidebar-border/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-sidebar-primary/10 text-sidebar-primary rounded-lg shrink-0">
              <HardDrive size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-foreground">Storage</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {formatSize(storageUsed)} of {formatSize(storageLimit)} used
              </p>
            </div>
          </div>
          <div className="w-full bg-sidebar-border rounded-full h-2 overflow-hidden">
            <div
              className="bg-sidebar-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>
    </aside>
  );
}
