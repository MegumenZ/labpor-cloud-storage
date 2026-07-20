import { lazy, Suspense } from "react";
import MoveModal from "./modals/MoveModal";
import DeleteModal from "./modals/DeleteModal";
import PropertiesModal from "./modals/PropertiesModal";
import ProfileModal from "./modals/ProfileModal";
import RenameModal from "./modals/RenameModal";
import StorageErrorModal from "./modals/StorageErrorModal";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PreviewModal = lazy(() => import("./modals/PreviewModal"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function GlobalModals({ fileState, authState, appState }: any) {
  const {
    selectedFile,
    setSelectedFile,
    filesToMove,
    setFilesToMove,
    fetchFiles,
    handleClearSelection,
    confirmDeleteConfig,
    setConfirmDeleteConfig,
    viewMode,
    fileProperties,
    setFileProperties,
    folderStack,
    fileToRename,
    setFileToRename,
    storageErrorConfig,
    setStorageErrorConfig,
    handleEmptyTrash,
    isNewFolderOpen,
    setIsNewFolderOpen,
    onCreateFolderSubmit,
    newFolderName,
    setNewFolderName,
  } = fileState;

  const { updateProfile } = authState;
  const { showProfileModal, setShowProfileModal } = appState;

  return (
    <>
      {/* Preview Modal */}
      <Dialog
        open={!!selectedFile}
        onOpenChange={(open: boolean) => !open && setSelectedFile(null)}
      >
        {selectedFile && (
          <Suspense fallback={
            <div className="w-full h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-popover rounded-2xl border border-border">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              <p className="text-sm font-medium">Memuat peninjau berkas...</p>
            </div>
          }>
            <PreviewModal file={selectedFile} />
          </Suspense>
        )}
      </Dialog>

      {/* Move Modal */}
      <Dialog
        open={filesToMove.length > 0}
        onOpenChange={(open: boolean) => !open && setFilesToMove([])}
      >
        {filesToMove.length > 0 && (
          <MoveModal
            files={filesToMove}
            onClose={() => setFilesToMove([])}
            onMoveSuccess={() => {
              fetchFiles();
              handleClearSelection();
            }}
          />
        )}
      </Dialog>

      {/* Delete Modal */}
      <Dialog
        open={!!confirmDeleteConfig}
        onOpenChange={(open: boolean) => !open && setConfirmDeleteConfig(null)}
      >
        {confirmDeleteConfig && (
          <DeleteModal
            onConfirm={confirmDeleteConfig.onConfirm}
            onCancel={() => setConfirmDeleteConfig(null)}
            isPermanent={viewMode === "trash"}
            title={confirmDeleteConfig.title}
            description={confirmDeleteConfig.description}
            confirmLabel={confirmDeleteConfig.confirmLabel}
          />
        )}
      </Dialog>

      {/* Properties Modal */}
      <Dialog
        open={!!fileProperties}
        onOpenChange={(open: boolean) => !open && setFileProperties(null)}
      >
        {fileProperties && (
          <PropertiesModal
            file={fileProperties}
            breadcrumbs={folderStack}
            onClose={() => setFileProperties(null)}
          />
        )}
      </Dialog>

      {/* Rename Modal */}
      <Dialog
        open={!!fileToRename}
        onOpenChange={(open: boolean) => !open && setFileToRename(null)}
      >
        {fileToRename && (
          <RenameModal
            file={fileToRename}
            onClose={() => setFileToRename(null)}
            onRenameSuccess={fetchFiles}
          />
        )}
      </Dialog>

      {/* Profile Modal */}
      <Dialog
        open={showProfileModal}
        onOpenChange={(open: boolean) => !open && setShowProfileModal(false)}
      >
        {showProfileModal && (
          <ProfileModal
            onClose={() => setShowProfileModal(false)}
            onUpdate={(updatedUser: {
              username?: string;
              displayName?: string | null;
              avatar?: string | null;
            }) => {
              updateProfile(updatedUser);
            }}
          />
        )}
      </Dialog>

      {/* Storage Error Modal */}
      <StorageErrorModal
        isOpen={!!storageErrorConfig}
        onClose={() => setStorageErrorConfig(null)}
        fileSize={storageErrorConfig?.fileSize || 0}
        availableStorage={storageErrorConfig?.availableStorage || 0}
        limit={storageErrorConfig?.limit || 0}
        absoluteMax={storageErrorConfig?.absoluteMax}
        onEmptyTrash={handleEmptyTrash}
        hasTrashItems={true}
      />

      {/* New Folder Modal */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Buat Folder Baru</DialogTitle>
            <DialogDescription>
              Masukkan nama folder baru yang ingin Anda buat di direktori saat ini.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateFolderSubmit}>
            <div className="grid gap-4 py-4">
              <input
                type="text"
                placeholder="Nama Folder"
                value={newFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                autoFocus
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewFolderOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={!newFolderName.trim()}>
                Buat Folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
