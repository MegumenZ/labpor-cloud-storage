import { useState, useEffect } from "react";
import {
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
import { DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// DOCX file viewer component using mammoth
const LocalDocxViewer = ({ url }: { url: string }) => {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => mammoth.convertToHtml({ arrayBuffer: b }))
      .then((r) => {
        setHtml(r.value);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [url]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        Memuat dokumen Word...
      </div>
    );
  }

  return (
    <div
      className="w-full h-full bg-background text-foreground p-8 overflow-y-auto prose dark:prose-invert max-w-none focus:outline-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface PreviewModalProps {
  file: FileItem;
}

export default function PreviewModal({ file }: PreviewModalProps) {
  const getIcon = (f: FileItem) => {
    const t = f.type.toLowerCase();
    const e = f.name.split(".").pop()?.toLowerCase() || "";

    if (t.includes("pdf") || e === "pdf")
      return <FileText className="text-red-500 shrink-0" size={24} />;
    if (["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-600 shrink-0" size={24} />;
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-600 shrink-0" size={24} />;
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500 shrink-0" size={24} />;

    if (t.includes("image"))
      return <ImageIcon className="text-purple-500 shrink-0" size={24} />;
    if (t.includes("video"))
      return <Film className="text-pink-500 shrink-0" size={24} />;
    if (t.includes("audio"))
      return <Music className="text-green-500 shrink-0" size={24} />;

    return <File className="text-slate-400 shrink-0" size={24} />;
  };

  const renderContent = () => {
    const { previewUrl: url, type, name } = file;
    if (!url)
      return (
        <div className="p-8 text-center text-muted-foreground">Berkas tidak ditemukan.</div>
      );

    const t = type.toLowerCase();
    const e = name.split(".").pop()?.toLowerCase() || "";

    // IMAGE
    if (
      t.includes("image") ||
      ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)
    )
      return (
        <div className="w-full h-full flex items-center justify-center p-2">
          <img
            src={url}
            alt="Preview Berkas"
            className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-sm border border-border"
          />
        </div>
      );

    // VIDEO
    if (t.includes("video") || ["mp4", "mkv", "webm"].includes(e))
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950 p-1 rounded-xl overflow-hidden shadow-inner">
          <video controls autoPlay className="w-full max-h-[72vh] bg-black">
            <source src={url} />
            Browser Anda tidak mendukung penayangan video.
          </video>
        </div>
      );

    // AUDIO
    if (t.includes("audio") || ["mp3", "wav"].includes(e))
      return (
        <div className="w-full h-full p-10 text-center flex flex-col items-center justify-center bg-muted/40 rounded-xl">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 mb-4 animate-pulse">
            <Music size={32} />
          </div>
          <p className="font-semibold text-foreground mb-4 text-sm truncate max-w-sm">{file.name}</p>
          <audio controls className="w-full max-w-md shadow-sm">
            <source src={url} />
            Browser Anda tidak mendukung pemutar audio.
          </audio>
        </div>
      );

    // DOCX
    if (e === "docx")
      return (
        <div className="w-full h-full bg-background rounded-xl border border-border overflow-hidden flex flex-col shadow-inner">
          <LocalDocxViewer url={url} />
        </div>
      );

    // PDF & OTHERS (DocViewer)
    return (
      <div className="w-full h-full bg-background rounded-xl border border-border overflow-hidden relative shadow-inner flex flex-col">
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
    <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col bg-popover border border-border shadow-2xl rounded-2xl animate-in zoom-in-95 duration-200">
      {/* HEADER PREVIEW */}
      <div className="p-4 border-b border-border flex justify-between items-center bg-popover shrink-0 select-none">
        <div className="flex items-center gap-3.5 min-w-0 pr-6">
          {getIcon(file)}
          <div className="min-w-0">
            <DialogTitle className="font-bold text-foreground text-sm md:text-base truncate block" title={file.name}>
              {file.name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs hidden md:block">
              {file.isFolder ? "Folder" : file.type || "Dokumen"}
            </DialogDescription>
          </div>
        </div>
      </div>

      {/* PREVIEW CONTAINER */}
      <div className="flex-1 bg-muted/30 p-4 overflow-auto flex items-center justify-center">
        <div className="w-full h-full flex items-center justify-center">
          {renderContent()}
        </div>
      </div>
    </DialogContent>
  );
}
