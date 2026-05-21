import { useState, useEffect } from "react";
import {
  X,
  Home,
  Folder,
  ChevronRight,
  Check,
  CornerUpLeft,
} from "lucide-react";
import type { FileItem } from "../../types";
import api from "../../api";

interface MoveModalProps {
  files: FileItem[];
  onClose: () => void;
  onMoveSuccess: () => void;
}

export default function MoveModal({
  files,
  onClose,
  onMoveSuccess,
}: MoveModalProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [folderList, setFolderList] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string; name: string }[]
  >([]);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    api
      .get("/files", { params: targetId ? { folderId: targetId } : {} })
      .then((res) => {
        if (res.data && res.data.data) {
          // Keamanan & Performa: Jangan tampilkan folder yang sedang dipindahkan
          // agar user tidak bisa memindahkan folder ke dalam dirinya sendiri atau ke dalam folder lain yang juga sedang dipindahkan.
          const movingIds = new Set(files.map((f) => f.id));
          setFolderList(
            res.data.data.filter(
              (f: FileItem) => f.isFolder && !movingIds.has(f.id)
            )
          );
        }
      })
      .catch(console.error);
  }, [targetId, files]);

  const executeMove = async () => {
    if (files.length === 0) return;
    setMoving(true);
    try {
      // Keamanan & Performa: Pindahkan semua berkas secara paralel menggunakan Promise.all
      await Promise.all(
        files.map((f) =>
          api.put(`/files/${f.id}/move`, { targetFolderId: targetId })
        )
      );
      onMoveSuccess();
      onClose();
    } catch (err) {
      const errMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Gagal memindahkan beberapa berkas.";
      alert(errMsg);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            {files.length === 1
              ? `Move "${files[0].name}"`
              : `Move ${files.length} items`}
          </h3>
          <button onClick={onClose} disabled={moving}>
            <X size={20} className="text-slate-400 hover:text-slate-600 cursor-pointer" />
          </button>
        </div>
        <div className="flex items-center gap-2 mb-2 text-sm bg-slate-100 p-2 rounded-lg text-slate-700">
          {targetId ? (
            <button
              onClick={() => {
                const newBread = [...breadcrumbs];
                newBread.pop();
                setBreadcrumbs(newBread);
                setTargetId(
                  newBread.length > 0 ? newBread[newBread.length - 1].id : null
                );
              }}
              disabled={moving}
              className="hover:text-blue-600 transition-colors"
            >
              <CornerUpLeft size={16} />
            </button>
          ) : (
            <Home size={16} className="text-slate-400" />
          )}
          <span className="truncate font-medium">
            {targetId ? breadcrumbs[breadcrumbs.length - 1]?.name : "Home"}
          </span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
          <button
            onClick={executeMove}
            disabled={moving}
            className={`w-full p-3 bg-blue-50 text-blue-700 font-medium rounded-xl flex gap-2 justify-center items-center border border-blue-200 transition-all hover:bg-blue-100 ${
              moving ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <Check size={16} /> {moving ? "Moving..." : "Move Here"}
          </button>
          {folderList.map((f) => (
            <button
              key={f.id}
              disabled={moving}
              onClick={() => {
                setTargetId(f.id);
                setBreadcrumbs([...breadcrumbs, { id: f.id, name: f.name }]);
              }}
              className="w-full flex justify-between items-center p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2 text-slate-700 font-medium truncate">
                <Folder size={18} className="text-blue-500 fill-blue-500/10 shrink-0" />{" "}
                <span className="truncate">{f.name}</span>
              </div>
              <ChevronRight size={16} className="text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
