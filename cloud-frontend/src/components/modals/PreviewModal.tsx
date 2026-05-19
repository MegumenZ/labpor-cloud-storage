import { useState, useEffect } from "react";
import {
  X,
  Film,
  Music,
  ImageIcon,
  FileText,
  File,
  FileSpreadsheet,
  FileType,
} from "lucide-react";
import type { FileItem } from "../../types";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import mammoth from "mammoth";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Komponen Kecil untuk DOCX (Mammoth)
const LocalDocxViewer = ({ url }: { url: string }) => {
  const [html, setHtml] = useState("");
  useEffect(() => {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => mammoth.convertToHtml({ arrayBuffer: b }))
      .then((r) => setHtml(r.value))
      .catch(console.error);
  }, [url]);
  return (
    <div
      className="w-full h-full bg-white p-8 overflow-y-auto prose max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface PreviewModalProps {
  file: FileItem;
  onClose: () => void;
}

export default function PreviewModal({ file, onClose }: PreviewModalProps) {
  // --- 1. FUNGSI MEMILIH ICON (Agar import tidak error unused) ---
  const getIcon = (f: FileItem) => {
    const t = f.type.toLowerCase();
    const e = f.name.split(".").pop()?.toLowerCase() || "";

    if (t.includes("pdf") || e === "pdf")
      return <FileText className="text-red-500" size={24} />;
    if (["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-600" size={24} />;

    // FileSpreadsheet dipakai disini
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-600" size={24} />;

    // FileType dipakai disini
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500" size={24} />;

    // ImageIcon dipakai disini
    if (t.includes("image"))
      return <ImageIcon className="text-purple-500" size={24} />;

    // Film dipakai disini
    if (t.includes("video"))
      return <Film className="text-pink-500" size={24} />;

    // Music dipakai disini
    if (t.includes("audio"))
      return <Music className="text-green-500" size={24} />;

    // File (Default) dipakai disini
    return <File className="text-slate-400" size={24} />;
  };

  // --- 2. RENDER KONTEN UTAMA ---
  const renderContent = () => {
    const { previewUrl: url, type, name } = file;
    if (!url)
      return (
        <div className="p-8 text-center text-slate-400">File not found.</div>
      );

    const t = type.toLowerCase();
    const e = name.split(".").pop()?.toLowerCase() || "";

    // IMAGE
    if (
      t.includes("image") ||
      ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)
    )
      return (
        <img
          src={url}
          alt="Preview"
          className="max-w-full max-h-[80vh] object-contain"
        />
      );

    // VIDEO
    if (t.includes("video") || ["mp4", "mkv", "webm"].includes(e))
      return (
        <div className="w-full flex justify-center">
          <video controls autoPlay className="max-w-full max-h-[80vh] bg-black">
            <source src={url} />
          </video>
        </div>
      );

    // AUDIO
    if (t.includes("audio") || ["mp3", "wav"].includes(e))
      return (
        <div className="w-full p-10 text-center flex flex-col items-center justify-center">
          <Music size={64} className="text-slate-300 mb-4" />
          <audio controls className="w-full max-w-md">
            <source src={url} />
          </audio>
        </div>
      );

    // DOCX
    if (e === "docx")
      return (
        <div className="w-full h-[80vh] bg-white rounded-lg border overflow-hidden">
          <LocalDocxViewer url={url} />
        </div>
      );

    // PDF & OTHERS (DocViewer)
    return (
      <div className="w-full h-[80vh] bg-white rounded-lg border relative">
        <DocViewer
          documents={[{ uri: url, fileType: e }]}
          pluginRenderers={DocViewerRenderers}
          config={{
            header: { disableHeader: true },
            pdfVerticalScrollByDefault: true,
            pdfZoom: { defaultZoom: 1.1, zoomJump: 0.1 },
          }}
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden relative max-h-[95vh]">
        {/* HEADER MODAL */}
        <div className="p-4 border-b flex justify-between items-center bg-white">
          <div className="flex items-center gap-3">
            {/* KITA PANGGIL FUNGSI ICON DISINI SUPAYA TIDAK UNUSED */}
            {getIcon(file)}
            <h3 className="font-bold line-clamp-1">{file.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            <X size={24} />
          </button>
        </div>

        {/* ISI MODAL */}
        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-auto p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
