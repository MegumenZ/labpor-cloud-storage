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
  file: FileItem;
  onClose: () => void;
  onMoveSuccess: () => void;
}

export default function MoveModal({
  file,
  onClose,
  onMoveSuccess,
}: MoveModalProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [folderList, setFolderList] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    api
      .get("/files", { params: targetId ? { folderId: targetId } : {} })
      .then((res) => {
        if (res.data.success) {
          setFolderList(
            res.data.data.filter(
              (f: FileItem) => f.isFolder && f.id !== file.id
            )
          );
        }
      })
      .catch(console.error);
  }, [targetId, file.id]);

  const executeMove = async () => {
    try {
      await api.put(`/files/${file.id}/move`, { targetFolderId: targetId });
      onMoveSuccess();
      onClose();
    } catch {
      alert("Gagal pindah.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Move "{file.name}"</h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2 mb-2 text-sm bg-slate-100 p-2 rounded-lg">
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
            >
              <CornerUpLeft size={16} />
            </button>
          ) : (
            <Home size={16} />
          )}
          <span className="truncate font-medium">
            {targetId ? breadcrumbs[breadcrumbs.length - 1]?.name : "Home"}
          </span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
          <button
            onClick={executeMove}
            className="w-full p-3 bg-blue-50 text-blue-700 font-medium rounded-xl flex gap-2 justify-center border border-blue-200"
          >
            <Check size={16} /> Move Here
          </button>
          {folderList.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setTargetId(f.id);
                setBreadcrumbs([...breadcrumbs, { id: f.id, name: f.name }]);
              }}
              className="w-full flex justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100"
            >
              <div className="flex gap-2">
                <Folder size={18} className="text-yellow-500" /> {f.name}
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
