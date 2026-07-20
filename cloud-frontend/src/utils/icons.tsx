import { Folder, Image as ImageIcon, FileText, Film, Music, File, FileSpreadsheet, FileType } from "lucide-react";

export const getIcon = (f: { isFolder: boolean, type?: string, name?: string }, iconSize = 40) => {
    if (f.isFolder)
      return <Folder className="text-blue-500 fill-blue-500/20 flex-shrink-0" size={iconSize} />;
    
    const t = f.type?.toLowerCase() || "";
    const e = f.name?.split(".").pop()?.toLowerCase() || "";

    if (t.includes("image"))
      return <ImageIcon className="text-purple-500 flex-shrink-0" size={iconSize} />;
    if (t.includes("video"))
      return <Film className="text-pink-500 flex-shrink-0" size={iconSize} />;
    if (t.includes("audio"))
      return <Music className="text-green-500 flex-shrink-0" size={iconSize} />;
    if (t.includes("pdf") || ["doc", "docx", "odt", "rtf"].includes(e))
      return <FileText className="text-blue-500 flex-shrink-0" size={iconSize} />;
    if (["xls", "xlsx", "csv"].includes(e))
      return <FileSpreadsheet className="text-green-500 flex-shrink-0" size={iconSize} />;
    if (["ppt", "pptx"].includes(e))
      return <FileType className="text-orange-500 flex-shrink-0" size={iconSize} />;

    return <File className="text-slate-400 flex-shrink-0" size={iconSize} />;
};
