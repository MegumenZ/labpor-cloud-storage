import {
  X,
  File,
  Folder,
  FileText,
  ImageIcon,
  Film,
  Music,
  FileSpreadsheet,
  FileType,
} from "lucide-react";
import type { FileItem } from "../../types";

interface PropertiesModalProps {
  file: FileItem;
  breadcrumbs: { name: string }[];
  onClose: () => void;
}

export default function PropertiesModal({
  file,
  breadcrumbs,
  onClose,
}: PropertiesModalProps) {
  // LOGIC ICON LENGKAP (Agar semua icon yang diimpor terpakai)
  const getIcon = () => {
    const t = file.type.toLowerCase();
    const e = file.name.split(".").pop()?.toLowerCase() || "";

    if (file.isFolder)
      return <Folder className="text-blue-500 fill-current/20" size={40} />;

    // Icon Dokumen
    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-600" size={40} />;
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-600" size={40} />;
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500" size={40} />;

    // Icon Media
    if (t.includes("image"))
      return <ImageIcon className="text-purple-500" size={40} />;
    if (t.includes("video"))
      return <Film className="text-pink-500" size={40} />;
    if (t.includes("audio"))
      return <Music className="text-green-500" size={40} />;

    // Default
    return <File className="text-slate-400" size={40} />;
  };

  // Logic Background Color
  const getBgColor = () => {
    const t = file.type.toLowerCase();
    const e = file.name.split(".").pop()?.toLowerCase() || "";

    if (file.isFolder) return "bg-blue-50";
    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return "bg-blue-50";
    if (["xls", "xlsx", "csv"].includes(e)) return "bg-green-50";
    if (["ppt", "pptx"].includes(e)) return "bg-orange-50";
    if (t.includes("image")) return "bg-purple-50";
    if (t.includes("video")) return "bg-pink-50";
    if (t.includes("audio")) return "bg-green-50";
    return "bg-slate-100";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Properties</h3>
          <button onClick={onClose}>
            <X size={20} className="text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <div className="flex flex-col items-center mb-6">
          {/* Menggunakan helper baru untuk background */}
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-3 ${getBgColor()}`}
          >
            {getIcon()}
          </div>

          <p className="font-bold text-center text-slate-800 break-all w-full">
            {file.name}
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-slate-500">Type</span>
            <span className="font-medium text-slate-700">
              {file.isFolder ? "Folder" : file.type || "Unknown"}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-slate-500">Size</span>
            <span className="font-medium text-slate-700">{file.size}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-slate-500">Created</span>
            <span className="font-medium text-slate-700">
              {new Date(file.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-slate-500">Location</span>
            <span className="font-medium text-slate-700 text-right break-all">
              {["Home", ...breadcrumbs.map((b) => b.name)].join(" / ")}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl"
        >
          Close
        </button>
      </div>
    </div>
  );
}
