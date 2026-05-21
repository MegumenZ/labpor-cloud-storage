import {
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
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const getIcon = () => {
    const t = file.type.toLowerCase();
    const e = file.name.split(".").pop()?.toLowerCase() || "";

    if (file.isFolder)
      return <Folder className="text-blue-500 fill-current/10" size={44} />;

    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-600" size={44} />;
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-600" size={44} />;
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500" size={44} />;

    if (t.includes("image"))
      return <ImageIcon className="text-purple-500" size={44} />;
    if (t.includes("video"))
      return <Film className="text-pink-500" size={44} />;
    if (t.includes("audio"))
      return <Music className="text-green-500" size={44} />;

    return <File className="text-slate-400" size={44} />;
  };

  const getBgColor = () => {
    const t = file.type.toLowerCase();
    const e = file.name.split(".").pop()?.toLowerCase() || "";

    if (file.isFolder) return "bg-blue-500/10 border-blue-500/20";
    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return "bg-blue-500/10 border-blue-500/20";
    if (["xls", "xlsx", "csv"].includes(e)) return "bg-green-500/10 border-green-500/20";
    if (["ppt", "pptx"].includes(e)) return "bg-orange-500/10 border-orange-500/20";
    if (t.includes("image")) return "bg-purple-500/10 border-purple-500/20";
    if (t.includes("video")) return "bg-pink-500/10 border-pink-500/20";
    if (t.includes("audio")) return "bg-green-500/10 border-green-500/20";
    return "bg-muted/50 border-border";
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

  return (
    <DialogContent className="sm:max-w-[420px] border border-border/80 shadow-2xl rounded-2xl p-6 bg-popover text-popover-foreground animate-in zoom-in-95 duration-200">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-foreground">
          Informasi Berkas
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs">
          Rincian dan metadata teknis mengenai berkas/folder terpilih.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center my-4 py-2 select-none">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-3 border ${getBgColor()}`}
        >
          {getIcon()}
        </div>
        <p className="font-bold text-center text-foreground break-all w-full text-base px-2">
          {file.name}
        </p>
      </div>

      <div className="space-y-3.5 text-sm bg-muted/40 border border-border/80 p-4 rounded-xl">
        <div className="flex justify-between items-center border-b border-border pb-2.5">
          <span className="text-muted-foreground font-medium">Jenis</span>
          <span className="font-semibold text-foreground">
            {file.isFolder ? "Folder" : file.type || "Unknown"}
          </span>
        </div>
        <div className="flex justify-between items-center border-b border-border pb-2.5">
          <span className="text-muted-foreground font-medium">Ukuran</span>
          <span className="font-semibold text-foreground">
            {file.isFolder ? "—" : formatFileSize(file.size)}
          </span>
        </div>
        <div className="flex justify-between items-center border-b border-border pb-2.5">
          <span className="text-muted-foreground font-medium">Dibuat Pada</span>
          <span className="font-semibold text-foreground">
            {new Date(file.createdAt).toLocaleDateString("id-ID", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="flex justify-between items-start pt-1">
          <span className="text-muted-foreground font-medium shrink-0">Lokasi</span>
          <span className="font-semibold text-foreground text-right break-all max-w-[240px]">
            {["Home", ...breadcrumbs.map((b) => b.name)].join(" / ")}
          </span>
        </div>
      </div>

      <div className="mt-4 w-full flex justify-end">
        <Button
          onClick={onClose}
          className="w-full py-5 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all cursor-pointer"
        >
          Tutup Rincian
        </Button>
      </div>
    </DialogContent>
  );
}
