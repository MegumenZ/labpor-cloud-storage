import { AlertOctagon, CloudOff, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface StorageErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileSize: number;
  availableStorage: number;
  limit: number;
  absoluteMax?: boolean;
  onEmptyTrash?: () => void;
  hasTrashItems?: boolean;
}

export default function StorageErrorModal({
  isOpen,
  onClose,
  fileSize,
  availableStorage,
  limit,
  absoluteMax = false,
  onEmptyTrash,
  hasTrashItems = false,
}: StorageErrorModalProps) {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const usedStorage = limit - availableStorage;
  const currentPercentage = limit > 0 ? (usedStorage / limit) * 100 : 0;
  
  // Calculate what the percentage would be if this file were uploaded
  const projectedUsed = usedStorage + fileSize;
  const projectedPercentage = limit > 0 ? Math.min((projectedUsed / limit) * 100, 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] border border-border/80 shadow-2xl rounded-2xl p-6 bg-popover text-popover-foreground animate-in zoom-in-95 duration-200">
        <DialogHeader className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive animate-bounce">
            {absoluteMax ? <AlertOctagon size={24} /> : <CloudOff size={24} />}
          </div>
          <DialogTitle className="text-xl font-bold text-center text-foreground">
            {absoluteMax ? "Batas Ukuran Berkas Terlampaui" : "Ruang Penyimpanan Tidak Cukup"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-center text-sm leading-relaxed">
            {absoluteMax ? (
              <>
                Anda mencoba mengunggah berkas sebesar{" "}
                <strong className="text-foreground">{formatSize(fileSize)}</strong>. 
                Batas maksimal unggahan berkas tunggal adalah{" "}
                <strong className="text-foreground">500 GB</strong>.
              </>
            ) : (
              <>
                Anda mencoba mengunggah berkas sebesar{" "}
                <strong className="text-foreground">{formatSize(fileSize)}</strong>, 
                tetapi kapasitas kosong Anda hanya tersisa{" "}
                <strong className="text-foreground">{formatSize(availableStorage)}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Visual Progress Bar (Only show if not absolute max size error) */}
        {!absoluteMax && limit > 0 && (
          <div className="my-5 space-y-2 bg-muted/30 border border-border/60 p-4 rounded-xl">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
              <span>Status Kapasitas</span>
              <span>
                {formatSize(usedStorage)} / {formatSize(limit)}
              </span>
            </div>
            
            {/* Double Bar showing Current and Projected Overflow */}
            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden relative">
              {/* Projected overflow bar */}
              <div 
                className="absolute top-0 left-0 h-full bg-destructive/40 transition-all duration-300"
                style={{ width: `${projectedPercentage}%` }}
              />
              {/* Current usage bar */}
              <div 
                className="absolute top-0 left-0 h-full bg-primary transition-all duration-300"
                style={{ width: `${currentPercentage}%` }}
              />
            </div>
            
            <div className="flex items-center gap-1.5 text-[11px] text-destructive font-medium pt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive/60 inline-block"></span>
              <span>Kelebihan Kapasitas: +{formatSize(fileSize - availableStorage)}</span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-3 mt-4 w-full">
          {!absoluteMax && onEmptyTrash && hasTrashItems ? (
            <>
              <Button
                onClick={onEmptyTrash}
                variant="outline"
                className="flex-1 py-5 rounded-xl font-semibold border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 size={16} />
                Kosongkan Trash
              </Button>
              <Button
                onClick={onClose}
                className="flex-1 py-5 rounded-xl font-semibold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all cursor-pointer"
              >
                Tutup
              </Button>
            </>
          ) : (
            <Button
              onClick={onClose}
              className="w-full py-5 rounded-xl font-semibold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all cursor-pointer"
            >
              Mengerti
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
