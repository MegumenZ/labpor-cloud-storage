import { useState, useMemo } from "react";
import {
  Folder,
  FileText,
  Image as ImageIcon,
  File,
  Film,
  Music,
  MoreVertical,
  Eye,
  Download,
  Edit2,
  FolderInput,
  Info,
  Trash2,
  Cloud,
  FileSpreadsheet,
  FileType,
  RefreshCw,
  LayoutGrid,
  List,
  Star
} from "lucide-react";
import type { FileItem } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FileGridProps {
  files: FileItem[];
  loading?: boolean;
  onNavigate: (folder: FileItem) => void;
  onSelect: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onProperties: (file: FileItem) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  isTrash?: boolean;
  // Selection Props
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite?: (file: FileItem) => void;
}

export function FileGrid({
  files,
  loading,
  onNavigate,
  onSelect,
  onDownload,
  onRename,
  onMove,
  onProperties,
  onDelete,
  onRestore,
  isTrash,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleFavorite
}: FileGridProps) {
  const [viewLayout, setViewLayout] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("fileViewLayout") as "grid" | "list") || "grid";
  });

  // Sorting state
  const [sortField, setSortField] = useState<"name" | "size" | "type" | "createdAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleLayoutChange = (layout: "grid" | "list") => {
    setViewLayout(layout);
    localStorage.setItem("fileViewLayout", layout);
  };

  const getIcon = (f: FileItem, iconSize = 40) => {
    if (f.isFolder)
      return <Folder className="text-blue-500 fill-blue-500/20" size={iconSize} />;
    const t = f.type.toLowerCase();
    const e = f.name.split(".").pop()?.toLowerCase() || "";

    if (t.includes("image"))
      return <ImageIcon className="text-purple-500" size={iconSize} />;
    if (t.includes("video"))
      return <Film className="text-pink-500" size={iconSize} />;
    if (t.includes("audio"))
      return <Music className="text-green-500" size={iconSize} />;
    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-500" size={iconSize} />;
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-500" size={iconSize} />;
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500" size={iconSize} />;

    return <File className="text-slate-400" size={iconSize} />;
  };

  const formatFileSize = (size: string | number) => {
    if (typeof size === "string" && /[a-zA-Z]/.test(size)) return size;

    const bytes = typeof size === "number" ? size : parseFloat(size);
    if (isNaN(bytes)) return String(size);
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Performa: Gunakan useMemo untuk mengurutkan file secara instan di sisi klien
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      // 1. Folders selalu berada di urutan paling atas
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;

      // 2. Sort folders atau files berdasarkan sortField dan sortOrder
      if (sortField === "size") {
        const sizeA = typeof a.size === "number" ? a.size : parseFloat(a.size) || 0;
        const sizeB = typeof b.size === "number" ? b.size : parseFloat(b.size) || 0;
        return sortOrder === "asc" ? sizeA - sizeB : sizeB - sizeA;
      }

      if (sortField === "createdAt") {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }

      if (sortField === "type") {
        const typeA = a.isFolder ? "folder" : (a.type || "").toLowerCase();
        const typeB = b.isFolder ? "folder" : (b.type || "").toLowerCase();
        if (typeA < typeB) return sortOrder === "asc" ? -1 : 1;
        if (typeA > typeB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      }

      // Default sorting by name
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      if (nameA < nameB) return sortOrder === "asc" ? -1 : 1;
      if (nameA > nameB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [files, sortField, sortOrder]);

  const handleHeaderClick = (field: "name" | "size" | "type" | "createdAt") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIndicator = (field: "name" | "size" | "type" | "createdAt") => {
    if (sortField !== field) return null;
    return (
      <span className="text-primary font-bold ml-1 text-xs shrink-0 select-none">
        {sortOrder === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  if (loading)
    return (
      <div className="text-center py-10 text-slate-400">Loading files...</div>
    );

  if (files.length === 0)
    return (
      <div className="text-center py-24 border border-border/80 rounded-3xl text-muted-foreground bg-gradient-to-b from-card to-muted/20 shadow-sm max-w-xl mx-auto animate-in fade-in zoom-in-95 duration-300 mt-10">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-primary/5">
          <Cloud size={36} className="text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {isTrash ? "Trash is Empty" : "Empty Directory"}
        </h3>
        <p className="text-sm text-muted-foreground/80 max-w-xs mx-auto font-medium leading-relaxed">
          {isTrash 
            ? "Items moved to trash will appear here. They will be deleted automatically after 30 days." 
            : "No files or folders found here. Drag & drop or click Upload to get started!"}
        </p>
      </div>
    );

  const isAllSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  return (
    <div className="pb-[300px]">
      {/* Layout & Sort Toggle bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted border border-border/40 px-3 py-1 rounded-full select-none">
          {files.length} {files.length === 1 ? "Item" : "Items"}
        </div>
        <div className="flex items-center gap-3">
          {/* Dropdown Sort */}
          <div className="relative">
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split("-") as [
                  "name" | "size" | "type" | "createdAt",
                  "asc" | "desc"
                ];
                setSortField(field);
                setSortOrder(order);
              }}
              className="px-3 py-1.5 bg-card border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer shadow-sm appearance-none pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:8px_8px] bg-[position:right_12px_center] bg-no-repeat dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')]"
            >
              <option value="name-asc">Name (A - Z)</option>
              <option value="name-desc">Name (Z - A)</option>
              <option value="size-asc">Size (Smallest)</option>
              <option value="size-desc">Size (Largest)</option>
              <option value="type-asc">Type (A - Z)</option>
              <option value="type-desc">Type (Z - A)</option>
              <option value="createdAt-desc">Date (Newest)</option>
              <option value="createdAt-asc">Date (Oldest)</option>
            </select>
          </div>

          {/* Grid/List Layout Toggles */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/30">
            <button
              onClick={() => handleLayoutChange("grid")}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                viewLayout === "grid"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => handleLayoutChange("list")}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                viewLayout === "list"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {viewLayout === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {sortedFiles.map((file) => (
            <div
              key={file.id}
              onClick={(e) => {
                e.stopPropagation();
                if (file.isFolder) {
                  onNavigate(file);
                } else {
                  onSelect(file);
                }
              }}
              className={`group p-5 rounded-3xl border cursor-pointer relative transition-all duration-300 z-10 shadow-[0_8px_30px_rgba(0,0,0,0.01)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] hover:shadow-md hover:-translate-y-1 active:scale-[0.98] ${
                selectedIds.has(file.id)
                  ? "border-primary ring-4 ring-primary/10 bg-primary/5 border-l-4 " + (file.isFolder ? "border-l-blue-500" : "border-l-primary")
                  : file.isFolder
                    ? "bg-blue-500/[0.04] dark:bg-blue-500/[0.08] border-border border-l-4 border-l-blue-500 hover:border-blue-400 hover:bg-blue-500/[0.07] dark:hover:bg-blue-500/[0.12]"
                    : "bg-card border-border border-l-4 border-l-muted-foreground/30 hover:border-primary/50 hover:border-l-primary"
              }`}
            >
              {/* Checkbox Selection (Hanya muncul jika di-hover atau ada file yang sudah diseleksi) */}
              <div
                className={`absolute top-4 left-4 z-20 transition-all duration-200 ${
                  selectedIds.has(file.id)
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(file.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(file.id)}
                  onChange={() => {}} // Di-handle oleh parent div onClick untuk keandalan input sentuh
                  className="w-5 h-5 text-primary bg-card border-border/80 rounded-lg cursor-pointer focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              {/* Favorite Star Button */}
              {!isTrash && (
                <button
                  type="button"
                  className={`absolute top-4 left-12 z-20 p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    file.isFavorite
                      ? "opacity-100 scale-100 text-amber-500 hover:scale-110 active:scale-95"
                      : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 text-slate-300 hover:text-amber-400 hover:scale-110 active:scale-95"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.(file);
                  }}
                  title={file.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                >
                  <Star size={18} className={file.isFavorite ? "fill-amber-500 text-amber-500 glow-star" : "text-slate-300"} />
                </button>
              )}

              {/* Tiga Titik Menu Pop-up / Restore & Delete */}
              <div className="absolute top-4 right-4 z-20" onClick={(e) => e.stopPropagation()}>
                {isTrash ? (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onRestore?.(file.id)}
                      className="p-1.5 hover:bg-green-500/10 dark:hover:bg-green-500/20 rounded-lg text-green-600 dark:text-green-400 cursor-pointer transition-all"
                      title="Restore"
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button
                      onClick={() => onDelete(file.id)}
                      className="p-1.5 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg text-red-600 dark:text-red-400 cursor-pointer transition-all"
                      title="Delete Permanently"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1.5 hover:bg-accent rounded-lg transition-all cursor-pointer text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-primary"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-popover border border-border shadow-2xl rounded-xl p-1 z-50 text-popover-foreground">
                      {!file.isFolder && (
                        <DropdownMenuItem
                          onClick={() => onSelect(file)}
                          className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                        >
                          <Eye size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Open
                        </DropdownMenuItem>
                      )}
                      {!file.isFolder && (
                        <DropdownMenuItem
                          onClick={() => onDownload(file)}
                          className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                        >
                          <Download size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Download
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onRename(file)}
                        className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                      >
                        <Edit2 size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onMove(file)}
                        className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                      >
                        <FolderInput size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Move
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onProperties(file)}
                        className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                      >
                        <Info size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Info
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1 border-t border-border" />
                      <DropdownMenuItem
                        onClick={() => onDelete(file.id)}
                        className="flex gap-2 items-center px-3 py-2 text-sm text-destructive font-medium hover:bg-destructive/10 dark:hover:bg-destructive/20 cursor-pointer rounded-lg transition-colors"
                      >
                        <Trash2 size={16} /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <div className="mb-4 flex justify-center mt-3 select-none">{getIcon(file)}</div>
              <div>
                <h3 className="font-bold truncate text-foreground text-sm" title={file.name}>
                  {file.name}
                </h3>
                <span className="text-xs text-muted-foreground font-semibold">
                  {file.isFolder ? "Folder" : formatFileSize(file.size)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List Detail Layout - Table View */
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-foreground/70">
                  {/* Select All Checkbox Header Column */}
                  <th className="py-4 px-6 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={onToggleSelectAll}
                      className="w-5 h-5 text-primary bg-card border-border/80 rounded-lg cursor-pointer focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </th>
                  {!isTrash && <th className="py-4 px-2 w-10 text-center"></th>}
                  <th
                    onClick={() => handleHeaderClick("name")}
                    className="py-4 px-6 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1">
                      Name {renderSortIndicator("name")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleHeaderClick("size")}
                    className="py-4 px-6 hidden sm:table-cell cursor-pointer hover:bg-muted/40 transition-colors select-none w-32"
                  >
                    <div className="flex items-center gap-1">
                      Size {renderSortIndicator("size")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleHeaderClick("type")}
                    className="py-4 px-6 hidden md:table-cell cursor-pointer hover:bg-muted/40 transition-colors select-none w-36"
                  >
                    <div className="flex items-center gap-1">
                      Type {renderSortIndicator("type")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleHeaderClick("createdAt")}
                    className="py-4 px-6 hidden lg:table-cell cursor-pointer hover:bg-muted/40 transition-colors select-none w-48"
                  >
                    <div className="flex items-center gap-1">
                      Date Created {renderSortIndicator("createdAt")}
                    </div>
                  </th>
                  <th className="py-4 px-6 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {sortedFiles.map((file) => {
                  const isSelected = selectedIds.has(file.id);
                  let rowStyle = "hover:bg-accent/40 cursor-pointer transition-colors group relative border-b border-border";
                  if (isSelected) {
                    rowStyle += " bg-primary/5 hover:bg-primary/10";
                  } else if (file.isFolder) {
                    rowStyle += " bg-blue-500/[0.02] dark:bg-blue-500/[0.05] hover:bg-blue-500/[0.06] dark:hover:bg-blue-500/[0.09]";
                  }
                  return (
                    <tr
                    key={file.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.isFolder) {
                        onNavigate(file);
                      } else {
                        onSelect(file);
                      }
                    }}
                    className={rowStyle}
                  >
                    {/* Row Checkbox Column */}
                    <td className="py-3 px-6 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(file.id)}
                        onChange={() => onToggleSelect(file.id)}
                        className="w-5 h-5 text-primary bg-card border-border/80 rounded-lg cursor-pointer focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </td>

                    {/* Favorite Column */}
                    {!isTrash && (
                      <td className="py-3 px-2 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite?.(file)}
                          className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                            file.isFavorite
                              ? "text-amber-500 hover:scale-110 active:scale-95"
                              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:scale-110 active:scale-95"
                          }`}
                          title={file.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                        >
                          <Star size={16} className={file.isFavorite ? "fill-amber-500 text-amber-500 glow-star" : "text-slate-300"} />
                        </button>
                      </td>
                    )}

                    {/* Name Column */}
                    <td className="py-3 px-6 font-bold text-foreground min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-muted/40 border border-border group-hover:scale-105 transition-transform">
                          {getIcon(file, 20)}
                        </div>
                        <span className="truncate max-w-[150px] sm:max-w-[300px]" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    </td>

                    {/* Size Column */}
                    <td className="py-3 px-6 text-muted-foreground hidden sm:table-cell">
                      {file.isFolder ? "—" : formatFileSize(file.size)}
                    </td>

                    {/* Type Column */}
                    <td className="py-3 px-6 text-muted-foreground/80 hidden md:table-cell capitalize">
                      {file.isFolder ? "Folder" : file.type.split("/")[1] || file.name.split(".").pop() || "Unknown"}
                    </td>

                    {/* Date Column */}
                    <td className="py-3 px-6 text-muted-foreground/80 hidden lg:table-cell">
                      {new Date(file.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3 px-6 text-right relative" onClick={(e) => e.stopPropagation()}>
                      {isTrash ? (
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onRestore?.(file.id)}
                            className="p-1.5 hover:bg-green-500/10 dark:hover:bg-green-500/20 rounded-lg text-green-600 dark:text-green-400 cursor-pointer transition-all"
                            title="Restore"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => onDelete(file.id)}
                            className="p-1.5 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg text-red-600 dark:text-red-400 cursor-pointer transition-all"
                            title="Delete Permanently"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1.5 hover:bg-accent rounded-lg transition-all cursor-pointer text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-primary"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-popover border border-border shadow-2xl rounded-xl p-1 z-50 text-popover-foreground">
                            {!file.isFolder && (
                              <DropdownMenuItem
                                onClick={() => onSelect(file)}
                                className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                              >
                                <Eye size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Open
                              </DropdownMenuItem>
                            )}
                            {!file.isFolder && (
                              <DropdownMenuItem
                                onClick={() => onDownload(file)}
                                className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                              >
                                <Download size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => onRename(file)}
                              className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                            >
                              <Edit2 size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onMove(file)}
                              className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                            >
                              <FolderInput size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Move
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onProperties(file)}
                              className="flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
                            >
                              <Info size={16} className="text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground" /> Info
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1 border-t border-border" />
                            <DropdownMenuItem
                              onClick={() => onDelete(file.id)}
                              className="flex gap-2 items-center px-3 py-2 text-sm text-destructive font-medium hover:bg-destructive/10 dark:hover:bg-destructive/20 cursor-pointer rounded-lg transition-colors"
                            >
                              <Trash2 size={16} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
