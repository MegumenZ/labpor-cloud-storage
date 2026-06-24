import { AlertTriangle } from "lucide-react";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isPermanent?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export default function DeleteModal({
  onConfirm,
  onCancel,
  isPermanent = false,
  title,
  description,
  confirmLabel,
}: DeleteModalProps) {
  const displayTitle = title || (isPermanent ? "Hapus Permanen?" : "Pindahkan ke Trash?");
  const displayDescription = description || (isPermanent
    ? "Apakah Anda yakin ingin menghapus item ini secara permanen? Tindakan ini tidak dapat dibatalkan."
    : "Apakah Anda yakin ingin memindahkan item ini ke Trash? Anda masih dapat memulihkannya nanti.");
  const displayConfirmLabel = confirmLabel || (isPermanent ? "Hapus Permanen" : "Pindahkan");

  return (
    <DialogContent className="sm:max-w-[400px] border border-border/80 shadow-2xl rounded-2xl p-6 bg-popover text-popover-foreground animate-in zoom-in-95 duration-200">
      <DialogHeader className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive animate-pulse">
          <AlertTriangle size={24} />
        </div>
        <DialogTitle className="text-xl font-bold text-center text-foreground">
          {displayTitle}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-center text-sm leading-relaxed">
          {displayDescription}
        </DialogDescription>
      </DialogHeader>

      <div className="flex gap-3 w-full mt-4">
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1 py-5 rounded-xl font-semibold border-border hover:bg-accent text-foreground transition-all cursor-pointer"
        >
          Batal
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-1 py-5 rounded-xl font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-md shadow-destructive/10 transition-all cursor-pointer"
        >
          {displayConfirmLabel}
        </Button>
      </div>
    </DialogContent>
  );
}
