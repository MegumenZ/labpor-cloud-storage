import { useState, useEffect } from "react";
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
  RefreshCw
} from "lucide-react";
import type { FileItem } from "../types";

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
  isTrash
}: FileGridProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Klik luar untuk tutup menu
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId) window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [activeMenuId]);

  const getIcon = (f: FileItem) => {
    if (f.isFolder)
      return <Folder className="text-blue-500 fill-blue-500/20" size={40} />;
    const t = f.type.toLowerCase();
    const e = f.name.split(".").pop()?.toLowerCase() || "";

    if (t.includes("image"))
      return <ImageIcon className="text-purple-500" size={40} />;
    if (t.includes("video"))
      return <Film className="text-pink-500" size={40} />;
    if (t.includes("audio"))
      return <Music className="text-green-500" size={40} />;
    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-500" size={40} />;
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-500" size={40} />;
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500" size={40} />;

    return <File className="text-slate-400" size={40} />;
  };

  const formatFileSize = (size: string) => {
    // If it already contains letters (units like KB, MB), assume it's already formatted
    if (/[a-zA-Z]/.test(size)) return size;

    const bytes = parseFloat(size);
    if (isNaN(bytes)) return size;
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (loading)
    return (
      <div className="text-center py-10 text-slate-400">Loading files...</div>
    );

  if (files.length === 0)
    return (
      <div className="text-center py-20 border-2 border-dashed rounded-xl text-slate-400 bg-slate-50/50">
        <Cloud size={48} className="mx-auto mb-2" />
        <p>{isTrash ? "Trash is empty" : "Empty Folder"}</p>
      </div>
    );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-[300px]">
      {files.map((file) => (
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
          className={`group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer relative transition-all 
            ${activeMenuId === file.id
              ? "z-40 shadow-xl"
              : "z-10 hover:shadow-md hover:-translate-y-1"
            }`}
        >
          <div className="absolute top-4 right-4 z-10">
            {isTrash ? (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.(file.id);
                  }}
                  className="p-1.5 hover:bg-green-50 rounded-lg text-green-600"
                  title="Restore"
                >
                  <RefreshCw size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file.id);
                  }}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-red-600"
                  title="Delete Permanently"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuId(activeMenuId === file.id ? null : file.id);
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={20} />
                </button>

                {activeMenuId === file.id && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                    {!file.isFolder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(file);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex gap-2 items-center"
                      >
                        <Eye size={16} /> Open
                      </button>
                    )}
                    {!file.isFolder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(file);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex gap-2 items-center"
                      >
                        <Download size={16} /> Download
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRename(file);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex gap-2 items-center"
                    >
                      <Edit2 size={16} /> Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(file);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex gap-2 items-center"
                    >
                      <FolderInput size={16} /> Move
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onProperties(file);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex gap-2 items-center"
                    >
                      <Info size={16} /> Info
                    </button>
                    <div className="border-t my-1"></div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(file.id);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex gap-2 items-center"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mb-4 flex justify-center">{getIcon(file)}</div>
          <div>
            <h3 className="font-semibold truncate text-slate-700">
              {file.name}
            </h3>
            <span className="text-xs text-slate-400">{formatFileSize(file.size)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
