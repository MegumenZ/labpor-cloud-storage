import { useState, lazy, Suspense } from "react";
import { Cloud, FolderInput, Trash2, Download, X, CloudOff } from "lucide-react";
import Login from "./Login";
import api from "./api";

// Import Custom Hooks
import { useAuth } from "./hooks/useAuth";
import { useTheme } from "./hooks/useTheme";
import { useFiles } from "./hooks/useFiles";

// Import Components
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { FileGrid } from "./components/FileGrid";
import Breadcrumbs from "./components/Breadcrumbs";

const PreviewModal = lazy(() => import("./components/modals/PreviewModal"));
import MoveModal from "./components/modals/MoveModal";
import DeleteModal from "./components/modals/DeleteModal";
import PropertiesModal from "./components/modals/PropertiesModal";
import ProfileModal from "./components/modals/ProfileModal";

// Import shadcn/ui & Sonner Premium Components
import { Toaster, toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function App() {
  const {
    isAuthenticated,
    currentUser,
    displayName,
    userAvatar,
    authLoading,
    isStorageOnline,
    storageInfo,
    refreshStorageInfo,
    login,
    logout,
    updateProfile,
  } = useAuth();

  const { theme, toggleTheme } = useTheme(isAuthenticated);

  const {
    files,
    loading,
    currentFolderId,
    folderStack,
    searchQuery,
    viewMode,
    selectedIds,
    fileToDelete,
    setFileToDelete,
    selectedFile,
    setSelectedFile,
    filesToMove,
    setFilesToMove,
    fileProperties,
    setFileProperties,
    isNewFolderOpen,
    setIsNewFolderOpen,
    newFolderName,
    setNewFolderName,
    isDragging,
    fetchFiles,
    handleUploadInput,
    handleCreateFolder,
    onCreateFolderSubmit,
    handleDelete,
    handleRestore,
    handleEmptyTrash,
    handleDownload,
    handleRename,
    handleToggleFavorite,
    handleToggleLock,
    handleChangeView,
    prepareMove,
    handleToggleSelect,
    handleToggleSelectAll,
    handleClearSelection,
    handleBulkDelete,
    handleBulkDownload,
    handleNavigate,
    handleEnterFolder,
    handleDeleteRequest,
    showProperties,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleSearch,
    uploadingFiles,
    cancelUpload,
  } = useFiles(isAuthenticated, isStorageOnline, refreshStorageInfo);

  // Local UI-only drawer and modal visibility states
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Login
        onLoginSuccess={(u) => {
          api.get("/auth/me").then((res) => {
            if (res.data.authenticated) {
              login(u, res.data.user);
            }
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex font-sans text-foreground relative">
      {/* GLOBAL SONNER TOASTER */}
      <Toaster richColors position="bottom-right" closeButton />

      {/* MODALS */}
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
            <PreviewModal
              file={selectedFile}
            />
          </Suspense>
        )}
      </Dialog>

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

      <Dialog
        open={!!fileToDelete}
        onOpenChange={(open: boolean) => !open && setFileToDelete(null)}
      >
        {fileToDelete && (
          <DeleteModal
            onConfirm={handleDelete}
            onCancel={() => setFileToDelete(null)}
            isPermanent={viewMode === "trash"}
          />
        )}
      </Dialog>

      {/* Global shadcn/ui Dialog Integration for File Properties */}
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

      {/* Global shadcn/ui Dialog for New Folder Action */}
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
                onChange={(e) => setNewFolderName(e.target.value)}
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

      {/* MOBILE SIDEBAR OVERLAY/DRAWER */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop with blur and fade transition */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
            onClick={() => setIsMobileSidebarOpen(false)}
          ></div>
          {/* Sliding sidebar panel */}
          <div className="relative flex flex-col w-64 bg-sidebar h-full shadow-2xl z-50 animate-in slide-in-from-left duration-300">
            <Sidebar
              currentUser={currentUser}
              displayName={displayName}
              avatarUrl={userAvatar}
              storageUsed={storageInfo.used}
              storageLimit={storageInfo.limit}
              viewMode={viewMode}
              onUpload={(e) => {
                handleUploadInput(e);
                setIsMobileSidebarOpen(false);
              }}
              onCreateFolder={() => {
                handleCreateFolder();
                setIsMobileSidebarOpen(false);
              }}
              onShowProfile={() => {
                setShowProfileModal(true);
                setIsMobileSidebarOpen(false);
              }}
              onChangeView={(mode) => {
                handleChangeView(mode);
                setIsMobileSidebarOpen(false);
              }}
              isStorageOnline={isStorageOnline}
              onClose={() => setIsMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR WRAPPER */}
      <div className="hidden md:flex md:flex-col shrink-0 sticky top-0 h-screen z-10 w-64 border-r border-sidebar-border">
        <Sidebar
          currentUser={currentUser}
          displayName={displayName}
          avatarUrl={userAvatar}
          storageUsed={storageInfo.used}
          storageLimit={storageInfo.limit}
          viewMode={viewMode}
          onUpload={handleUploadInput}
          onCreateFolder={handleCreateFolder}
          onShowProfile={() => setShowProfileModal(true)}
          onChangeView={handleChangeView}
          isStorageOnline={isStorageOnline}
        />
      </div>

      <main
        className="flex-1 p-4 md:p-8 overflow-y-auto h-screen relative"
        onDragOver={isStorageOnline ? handleDragOver : undefined}
        onDragLeave={isStorageOnline ? handleDragLeave : undefined}
        onDrop={isStorageOnline ? handleDrop : undefined}
      >
        {isDragging && (
          <div className="fixed inset-0 z-50 bg-blue-500/10 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex items-center justify-center pointer-events-none">
            <div className="bg-popover border border-border/80 p-8 rounded-full shadow-2xl animate-bounce text-primary">
              <Cloud size={64} className="text-blue-500" />
            </div>
          </div>
        )}

        <Header
          theme={theme}
          onThemeToggle={toggleTheme}
          onSearch={handleSearch}
          searchQuery={searchQuery}
          onLogout={logout}
          onToggleSidebar={() => setIsMobileSidebarOpen(true)}
          title={
            viewMode === "trash"
              ? "Trash"
              : viewMode === "favorites"
                ? "Favorites"
                : currentFolderId
                  ? folderStack[folderStack.length - 1]?.name
                  : "My Files"
          }
          onEmptyTrash={handleEmptyTrash}
        />

        {!isStorageOnline ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 max-w-md mx-auto animate-in fade-in duration-300">
            <div className="w-20 h-20 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-6 relative group">
              <div className="absolute inset-0 rounded-2xl bg-destructive/20 animate-ping opacity-75"></div>
              <CloudOff size={40} className="relative z-10" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2.5 tracking-tight">
              Layanan Penyimpanan Terganggu
            </h2>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Sistem tidak dapat terhubung ke server penyimpanan utama. Silakan hubungi administrator sistem untuk bantuan lebih lanjut.
            </p>
            <Button
              onClick={async () => {
                const toastId = toast.loading("Memeriksa status server...");
                await refreshStorageInfo();
                toast.dismiss(toastId);
              }}
              className="px-6 py-5 rounded-xl font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all flex items-center gap-2 cursor-pointer active:scale-98"
            >
              Coba Hubungkan Kembali
            </Button>
          </div>
        ) : (
          <div className="flex-1 p-0 md:p-6 mt-4 md:mt-0">
            {/* Breadcrumb (Only show in 'files' mode) */}
            {viewMode === "files" && (
              <Breadcrumbs items={folderStack} onNavigate={handleNavigate} />
            )}

            <FileGrid
              files={files}
              loading={loading}
              onNavigate={handleEnterFolder}
              onSelect={setSelectedFile}
              onDownload={handleDownload}
              onRename={handleRename}
              onMove={prepareMove}
              onProperties={showProperties}
              onDelete={handleDeleteRequest}
              onRestore={handleRestore}
              isTrash={viewMode === "trash"}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleFavorite={handleToggleFavorite}
              currentUser={currentUser}
              onToggleLock={handleToggleLock}
            />
          </div>
        )}
      </main>

      {/* BULK ACTIONS FLOATING TOOLBAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-md shadow-2xl border border-border/80 px-3 py-2 sm:px-6 sm:py-3.5 rounded-2xl flex items-center gap-3 sm:gap-6 z-50 animate-in slide-in-from-bottom-5 duration-300 text-card-foreground max-w-[95vw] w-max select-none">
          <div className="text-xs sm:text-sm font-bold text-foreground select-none border-r pr-3 sm:pr-4 border-border shrink-0">
            {selectedIds.size} <span className="hidden sm:inline">selected</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={() =>
                setFilesToMove(files.filter((f) => selectedIds.has(f.id)))
              }
              className="p-2 sm:px-4 sm:py-2 hover:bg-accent rounded-xl text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer"
              title="Move selected"
            >
              <FolderInput size={16} /> <span className="hidden sm:inline">Move</span>
            </button>
            {viewMode === "files" && (
              <button
                onClick={handleBulkDownload}
                className="p-2 sm:px-4 sm:py-2 hover:bg-accent rounded-xl text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                title="Download selected"
              >
                <Download size={16} /> <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              className="p-2 sm:px-4 sm:py-2 hover:bg-destructive/15 rounded-xl text-xs sm:text-sm font-semibold text-destructive hover:bg-destructive/20 transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer"
              title="Delete selected"
            >
              <Trash2 size={16} /> <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
          <button
            onClick={handleClearSelection}
            className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-all cursor-pointer shrink-0"
            title="Clear Selection"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* UPLOADING FILES PROGRESS FLOATING CARD */}
      {uploadingFiles.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[60] bg-card/95 backdrop-blur-md shadow-2xl border border-border/80 p-4 rounded-2xl w-80 md:w-96 text-card-foreground animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
            <span className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              Mengunggah {uploadingFiles.length} berkas
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
            {uploadingFiles.map((file) => (
              <div key={file.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold gap-2">
                  <span className="truncate text-foreground max-w-[70%] font-medium" title={file.name}>
                    {file.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-muted-foreground">{file.progress}%</span>
                    <button
                      onClick={() => cancelUpload(file.id)}
                      className="p-1 hover:bg-destructive/15 rounded-lg text-muted-foreground hover:text-destructive transition-all cursor-pointer"
                      title="Batalkan unggahan"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${file.progress}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
