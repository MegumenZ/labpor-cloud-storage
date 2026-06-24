import { useState } from "react";
import api from "../../api";
import type { FileItem } from "../../types";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RenameModalProps {
  file: FileItem;
  onClose: () => void;
  onRenameSuccess: () => void;
}

export default function RenameModal({ file, onClose, onRenameSuccess }: RenameModalProps) {
  const [newName, setNewName] = useState(file.name);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName === file.name) return;

    setLoading(true);
    const toastId = toast.loading(`Mengubah nama menjadi "${newName}"...`);
    try {
      await api.put(`/files/${file.id}/rename`, { newName: newName.trim() });
      toast.success("Nama berhasil diubah!", { id: toastId });
      onRenameSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal mengubah nama berkas.";
      toast.error(errMsg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[400px] border border-border/80 shadow-2xl rounded-2xl p-6 bg-popover text-popover-foreground animate-in zoom-in-95 duration-200">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-foreground">
          Ubah Nama
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs">
          Masukkan nama baru untuk {file.isFolder ? "folder" : "berkas"} ini.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 my-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex h-10 w-full rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-all"
          autoFocus
          required
        />

        <div className="flex gap-3 w-full mt-4">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            disabled={loading}
            className="flex-1 py-5 rounded-xl font-semibold border-border hover:bg-accent text-foreground transition-all cursor-pointer disabled:opacity-50"
          >
            Batal
          </Button>
          <Button
            type="submit"
            disabled={loading || !newName.trim() || newName === file.name}
            className="flex-1 py-5 rounded-xl font-semibold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Menyimpan...
              </>
            ) : (
              "Simpan"
            )}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
