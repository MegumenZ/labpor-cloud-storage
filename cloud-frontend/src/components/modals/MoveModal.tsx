import { useState, useEffect } from "react";
import {
  Home,
  Folder,
  ChevronRight,
  Check,
  CornerUpLeft,
  Loader2,
} from "lucide-react";
import type { FileItem } from "../../types";
import api from "../../api";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    setLoadingFolders(true);
    api
      .get("/files", { params: targetId ? { folderId: targetId } : {} })
      .then((res) => {
        if (res.data && res.data.data) {
          const movingIds = new Set(files.map((f) => f.id));
          setFolderList(
            res.data.data.filter(
              (f: FileItem) => f.isFolder && !movingIds.has(f.id)
            )
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoadingFolders(false));
  }, [targetId, files]);

  const executeMove = async () => {
    if (files.length === 0) return;
    setMoving(true);
    try {
      await Promise.all(
        files.map((f) =>
          api.put(`/files/${f.id}/move`, { targetFolderId: targetId })
        )
      );
      onMoveSuccess();
      onClose();
    } catch (err) {
      const errMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Gagal memindahkan beberapa berkas.";
      toast.error(errMsg);
    } finally {
      setMoving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[420px] border border-border/80 shadow-2xl rounded-2xl p-6 bg-popover text-popover-foreground animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
      <DialogHeader className="relative">
        <DialogTitle className="text-xl font-bold text-foreground">
          {files.length === 1
            ? `Pindahkan "${files[0].name}"`
            : `Pindahkan ${files.length} Item`}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs">
          Pilih folder tujuan di bawah ini untuk memindahkan item Anda.
        </DialogDescription>
      </DialogHeader>

      {/* Path Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm bg-muted border border-border/80 p-2.5 rounded-xl text-foreground my-3 select-none">
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
            className="hover:text-primary hover:bg-card p-1 rounded-lg border border-border/50 text-foreground transition-all cursor-pointer shrink-0 disabled:opacity-50"
            title="Kembali ke folder sebelumnya"
          >
            <CornerUpLeft size={16} />
          </button>
        ) : (
          <Home size={16} className="text-muted-foreground shrink-0 ml-1" />
        )}
        <span className="truncate font-semibold text-foreground text-xs">
          {targetId ? breadcrumbs[breadcrumbs.length - 1]?.name : "Semua Berkas (Home)"}
        </span>
      </div>

      {/* Folder List Container */}
      <div className="space-y-2 overflow-y-auto mb-4 flex-1 pr-1 max-h-[300px] min-h-[150px]">
        {loadingFolders ? (
          <div className="h-32 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="animate-spin text-primary" size={24} />
            <span className="text-xs">Memuat folder...</span>
          </div>
        ) : folderList.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-xl bg-muted/30">
            <span className="text-xs font-medium">Tidak ada sub-folder di sini</span>
          </div>
        ) : (
          folderList.map((f) => (
            <button
              key={f.id}
              disabled={moving}
              onClick={() => {
                setTargetId(f.id);
                setBreadcrumbs([...breadcrumbs, { id: f.id, name: f.name }]);
              }}
              className="w-full flex justify-between items-center p-3 bg-muted/40 border border-border/60 rounded-xl hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all text-left cursor-pointer group disabled:opacity-50"
            >
              <div className="flex items-center gap-3.5 text-foreground font-semibold truncate group-hover:text-primary">
                <Folder size={20} className="text-blue-500 fill-blue-500/10 shrink-0" />{" "}
                <span className="truncate text-sm">{f.name}</span>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
            </button>
          ))
        )}
      </div>

      {/* Action Footer */}
      <div className="flex gap-3 pt-2 mt-auto border-t border-border">
        <Button
          onClick={onClose}
          variant="outline"
          disabled={moving}
          className="flex-1 py-5 rounded-xl font-semibold border-border hover:bg-accent text-foreground transition-all cursor-pointer disabled:opacity-50"
        >
          Batal
        </Button>
        <Button
          onClick={executeMove}
          disabled={moving}
          className="flex-1 py-5 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {moving ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Memindahkan...
            </>
          ) : (
            <>
              <Check size={16} />
              Pindahkan Ke Sini
            </>
          )}
        </Button>
      </div>
    </DialogContent>
  );
}
