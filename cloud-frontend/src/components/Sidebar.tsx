import { Cloud, Upload, Plus, LayoutGrid, Clock, Star, Trash2, HardDrive } from "lucide-react";
import { useRef } from "react";

interface SidebarProps {
  currentUser: string;
  displayName?: string;
  avatarUrl?: string | null;
  storageUsed: number;
  storageLimit: number;
  viewMode?: "files" | "trash" | "recent" | "favorites";
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateFolder: () => void;
  onShowProfile: () => void;
  onChangeView?: (mode: "files" | "trash" | "recent" | "favorites") => void;
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
    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold transition-all duration-300 active:scale-[0.98] cursor-pointer ${active
      ? "bg-gradient-to-r from-blue-50 to-indigo-50/50 text-blue-600 shadow-sm shadow-blue-500/5"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
  >
    <span className={`transition-transform duration-300 ${active ? "scale-110 text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`}>
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
    <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex md:flex-col shrink-0 sticky top-0 h-screen z-10">
      <div className="p-6 flex items-center gap-2 text-blue-600">
        <Cloud size={32} strokeWidth={2.5} />
        <span className="text-xl font-bold tracking-tight">SkyStore</span>
      </div>

      {/* BAGIAN PROFILE YANG BISA DIKLIK */}
      <button
        onClick={onShowProfile}
        className="px-6 py-2 mb-6 flex items-center gap-3 w-full text-left hover:bg-slate-50/80 transition-all duration-300 active:scale-[0.98] border-y border-transparent hover:border-slate-100 cursor-pointer"
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200 overflow-hidden">
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
          <p className="text-sm font-bold text-slate-700 truncate">
            {displayName || currentUser}
          </p>
          <p className="text-xs text-slate-400">Online</p>
        </div>
      </button>

      <div className="px-6 mb-6 space-y-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:from-blue-600 hover:to-indigo-700 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/5"
        >
          <Upload size={20} /> Upload File
        </button>
        <button
          onClick={onCreateFolder}
          className="w-full bg-white border border-slate-200 hover:border-blue-500/50 hover:text-blue-600 hover:bg-blue-50/10 text-slate-600 py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] font-semibold cursor-pointer shadow-sm hover:shadow-md hover:shadow-slate-100"
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
          icon={<Clock size={20} />}
          label="Recent"
          active={viewMode === "recent"}
          onClick={() => onChangeView?.("recent")}
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

      <div className="p-6 mt-auto border-t border-slate-100">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <HardDrive size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Storage</p>
              <p className="text-xs text-slate-500">
                {formatSize(storageUsed)} of {formatSize(storageLimit)} used
              </p>
            </div>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>
    </aside>
  );
}
