import { Eye, Download, Edit2, FolderInput, Info, Lock, Unlock, Trash2 } from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { FileItem } from "@/types";

interface FileActionsMenuProps {
  file: FileItem;
  currentUser: string | null | undefined;
  onSelect: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onProperties: (file: FileItem) => void;
  onToggleLock?: (file: FileItem) => void;
  onDelete: (id: string) => void;
}

export function FileActionsMenu({
  file,
  currentUser,
  onSelect,
  onDownload,
  onRename,
  onMove,
  onProperties,
  onToggleLock,
  onDelete,
}: FileActionsMenuProps) {
  return (
    <DropdownMenuContent align="end" className="w-48 bg-popover border border-border shadow-2xl rounded-xl p-1 z-50 text-popover-foreground">
      {!file.isFolder && (
        <DropdownMenuItem
          onClick={() => onSelect(file)}
          className="group flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
        >
          <Eye size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Open
        </DropdownMenuItem>
      )}
      {!file.isFolder && (
        <DropdownMenuItem
          onClick={() => onDownload(file)}
          className="group flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
        >
          <Download size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Download
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={() => onRename(file)}
        className="group flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
      >
        <Edit2 size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onMove(file)}
        className="group flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
      >
        <FolderInput size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Move
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onProperties(file)}
        className="group flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
      >
        <Info size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Info
      </DropdownMenuItem>
      {currentUser && file.uploaderUsername === currentUser && (
        <DropdownMenuItem
          onClick={() => onToggleLock?.(file)}
          className="group flex gap-2 items-center px-3 py-2 text-sm text-foreground font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg transition-colors"
        >
          {file.allowEdit ? (
            <>
              <Lock size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Lock Editing
            </>
          ) : (
            <>
              <Unlock size={16} className="text-muted-foreground group-hover:text-accent-foreground" /> Unlock Editing
            </>
          )}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator className="my-1 border-t border-border" />
      <DropdownMenuItem
        onClick={() => onDelete(file.id)}
        className="flex gap-2 items-center px-3 py-2 text-sm text-destructive font-medium hover:bg-destructive/10 dark:hover:bg-destructive/20 cursor-pointer rounded-lg transition-colors"
      >
        <Trash2 size={16} /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
