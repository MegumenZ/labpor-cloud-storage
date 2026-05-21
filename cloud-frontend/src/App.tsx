import { useState, useEffect, useCallback } from "react";
import { Cloud, FolderInput, Trash2, Download, X } from "lucide-react";
import Login from "./Login";
import api from "./api";
import type { FileItem } from "./types";

// Import Components
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { FileGrid } from "./components/FileGrid";
import Breadcrumbs from "./components/Breadcrumbs";
import PreviewModal from "./components/modals/PreviewModal";
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
  // --- STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    limit: number;
  }>({
    used: 0,
    limit: 0,
  });
  const [authLoading, setAuthLoading] = useState(true);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<
    "files" | "trash" | "recent" | "favorites"
  >("files");

  // Modal States
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [filesToMove, setFilesToMove] = useState<FileItem[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [fileProperties, setFileProperties] = useState<FileItem | null>(null);

  // shadcn/ui Dialog States
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Multi-Select States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isDragging, setIsDragging] = useState(false);

  // --- AUTH & FETCH ---
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  useEffect(() => {
    const checkAuth = async () => {
      api
        .get("/auth/me")
        .then((res) => {
          if (res.data.authenticated) {
            setIsAuthenticated(true);
            setCurrentUser(res.data.user.username);
            setDisplayName(res.data.user.displayName || "");
            setStorageInfo({
              used: res.data.user.usedStorage || 0,
              limit: res.data.user.storageLimit || 0,
            });
            if (res.data.user.avatar) {
              const avatar = res.data.user.avatar;
              setUserAvatar(
                avatar.startsWith("http")
                  ? avatar
                  : `${api.defaults.baseURL}/uploads/avatars/${avatar}`,
              );
            }
          }
        })
        .catch(() => {
          setIsAuthenticated(false);
          localStorage.removeItem("token");
        })
        .finally(() => setAuthLoading(false));
    };
    checkAuth();
  }, []);

  const fetchFiles = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (viewMode === "trash") {
        params.trash = "true";
      } else if (viewMode === "favorites") {
        params.favorite = "true";
      } else if (viewMode === "recent") {
        params.recent = "true";
      }

      if (searchQuery) {
        params.search = searchQuery;
      } else if (
        viewMode !== "trash" &&
        viewMode !== "favorites" &&
        viewMode !== "recent" &&
        currentFolderId
      ) {
        params.folderId = currentFolderId;
      }

      const res = await api.get("/files", { params });
      setFiles(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, currentFolderId, searchQuery, viewMode]);

  // Reset search query when changing folders or view modes
  useEffect(() => {
    setSearchQuery("");
  }, [currentFolderId, viewMode]);

  useEffect(() => {
    if (isAuthenticated) fetchFiles();
  }, [fetchFiles, isAuthenticated]);

  // --- HANDLERS ---
  const performUpload = async (file: globalThis.File) => {
    // Frontend validation (5GB limit for large Ceph uploads)
    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
    if (file.size > MAX_SIZE) {
      toast.error("Ukuran berkas melebihi batas maksimal 5GB!");
      return;
    }

    const toastId = toast.loading(`Mengunggah berkas "${file.name}"...`);
    const tempUrl = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append("file", file);
    if (currentFolderId) formData.append("parentId", currentFolderId);

    try {
      const res = await api.post("/files/upload-local", formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newFile = { ...res.data.data, previewUrl: tempUrl };
      setFiles((prev) => [newFile, ...prev]);
      toast.success(`Berkas "${file.name}" berhasil diunggah!`, {
        id: toastId,
      });
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Gagal mengunggah berkas";
      toast.error(message, { id: toastId });
    }
  };

  const handleLogout = async () => {
    await api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    toast.success("Berhasil keluar dari sistem");
  };

  const handleCreateFolder = () => {
    setNewFolderName("");
    setIsNewFolderOpen(true);
  };

  const onCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const toastId = toast.loading(`Membuat folder "${newFolderName}"...`);
    try {
      await api.post("/files/folder", {
        name: newFolderName,
        parentId: currentFolderId,
      });
      toast.success(`Folder "${newFolderName}" berhasil dibuat!`, {
        id: toastId,
      });
      setIsNewFolderOpen(false);
      setNewFolderName("");
      fetchFiles();
    } catch (err) {
      console.error(err); // Menyelesaikan ESLint @typescript-eslint/no-unused-vars
      toast.error("Gagal membuat folder baru", { id: toastId });
    }
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      performUpload(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleDelete = async () => {
    if (fileToDelete) {
      const isPermanent = viewMode === "trash";
      const toastId = toast.loading(
        isPermanent ? "Menghapus permanen..." : "Memindahkan ke Trash...",
      );
      try {
        await api.delete(`/files/${fileToDelete}`, {
          params: { permanent: isPermanent },
        });
        setFileToDelete(null);
        fetchFiles();
        toast.success(
          isPermanent
            ? "Berkas dihapus secara permanen!"
            : "Berkas dipindahkan ke Trash",
          { id: toastId },
        );
      } catch (err) {
        console.error(err); // Menyelesaikan ESLint @typescript-eslint/no-unused-vars
        toast.error("Gagal menghapus berkas", { id: toastId });
      }
    }
  };

  const handleRestore = async (id: string) => {
    const toastId = toast.loading("Memulihkan berkas...");
    try {
      await api.post(`/files/${id}/restore`);
      fetchFiles();
      toast.success("Berkas berhasil dipulihkan!", { id: toastId });
    } catch (err) {
      console.error(err); // Menyelesaikan ESLint @typescript-eslint/no-unused-vars
      toast.error("Gagal memulihkan berkas", { id: toastId });
    }
  };

  const handleEmptyTrash = async () => {
    if (
      confirm(
        "Apakah Anda yakin ingin menghapus permanen semua item di dalam Trash?",
      )
    ) {
      const toastId = toast.loading("Mengosongkan Trash...");
      try {
        await api.delete("/files/trash");
        fetchFiles();
        toast.success("Trash berhasil dikosongkan!", { id: toastId });
      } catch (err) {
        console.error(err); // Menyelesaikan ESLint @typescript-eslint/no-unused-vars
        toast.error("Gagal mengosongkan Trash", { id: toastId });
      }
    }
  };

  const handleDownload = async (f: FileItem) => {
    const toastId = toast.loading(`Mengunduh "${f.name}"...`);
    try {
      const res = await api.get(`/files/${f.id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", f.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Selesai mengunduh "${f.name}"`, { id: toastId });
    } catch (err) {
      console.error(err); // Menyelesaikan ESLint @typescript-eslint/no-unused-vars
      toast.error(`Gagal mengunduh "${f.name}"`, { id: toastId });
    }
  };

  const handleRename = async (f: FileItem) => {
    const name = prompt("Nama Baru:", f.name);
    if (name && name !== f.name) {
      const toastId = toast.loading("Mengubah nama...");
      try {
        await api.put(`/files/${f.id}/rename`, { newName: name });
        fetchFiles();
        toast.success("Nama berkas berhasil diubah!", { id: toastId });
      } catch (err) {
        console.error(err); // Menyelesaikan ESLint @typescript-eslint/no-unused-vars
        toast.error("Gagal mengubah nama berkas", { id: toastId });
      }
    }
  };

  const handleToggleFavorite = async (file: FileItem) => {
    // 1. Optimistic UI update
    setFiles((prev) =>
      prev.map((f) =>
        f.id === file.id ? { ...f, isFavorite: !f.isFavorite } : f,
      ),
    );
    try {
      await api.patch(`/files/${file.id}/favorite`);
      toast.success(
        file.isFavorite ? "Dihapus dari Favorit" : "Ditambahkan ke Favorit",
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      // Rollback
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, isFavorite: !!file.isFavorite } : f,
        ),
      );
      toast.error("Gagal memperbarui status favorit");
    }
  };

  const handleChangeView = (
    mode: "files" | "trash" | "recent" | "favorites",
  ) => {
    setViewMode(mode);
    if (mode !== "files") {
      setCurrentFolderId(null);
      setFolderStack([]);
    }
  };

  const prepareMove = (file: FileItem) => {
    setFilesToMove([file]);
  };

  // Selection & Bulk Handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allInFolder = files.map((f) => f.id);
      const allSelected = allInFolder.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        allInFolder.forEach((id) => next.delete(id));
      } else {
        allInFolder.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  useEffect(() => {
    handleClearSelection();
  }, [currentFolderId, viewMode, searchQuery]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const isPermanent = viewMode === "trash";
    const confirmMsg = isPermanent
      ? `Apakah Anda yakin ingin menghapus permanen ${selectedIds.size} item terpilih?`
      : `Pindahkan ${selectedIds.size} item terpilih ke Trash?`;

    if (confirm(confirmMsg)) {
      const toastId = toast.loading(
        `Menghapus ${selectedIds.size} elemen terpilih...`,
      );
      setLoading(true);
      try {
        await Promise.all(
          Array.from(selectedIds).map((id) =>
            api.delete(`/files/${id}`, { params: { permanent: isPermanent } }),
          ),
        );
        handleClearSelection();
        fetchFiles();
        toast.success("Item terpilih berhasil dihapus", { id: toastId });
      } catch {
        toast.error("Beberapa berkas gagal dihapus.", { id: toastId });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkDownload = async () => {
    const selectedFiles = files.filter((f) => selectedIds.has(f.id));
    const selectedOnlyFiles = selectedFiles.filter((f) => !f.isFolder);
    const folderCount = selectedFiles.length - selectedOnlyFiles.length;

    if (selectedOnlyFiles.length === 0) {
      toast.error(
        "Tidak ada file terpilih untuk diunduh (folder tidak dapat diunduh secara langsung).",
      );
      return;
    }

    if (folderCount > 0) {
      toast.info(
        `Catatan: ${folderCount} folder akan dilewati dari proses unduhan.`,
      );
    }

    const toastId = toast.loading(
      `Memulai proses unduh ${selectedOnlyFiles.length} berkas...`,
    );

    // Trigger downloads sequentially to prevent popup blocker blocking them
    for (let i = 0; i < selectedOnlyFiles.length; i++) {
      const f = selectedOnlyFiles[i];
      try {
        const res = await api.get(`/files/${f.id}/download`, {
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", f.name);
        document.body.appendChild(link);
        link.click();
        link.remove();
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Failed to download ${f.name}:`, err);
      }
    }
    toast.success("Seluruh unduhan berhasil dijalankan!", { id: toastId });
  };

  // Navigation Handlers
  const handleNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setFolderStack([]);
    } else {
      const folder =
        folderStack.find((f) => f.id === folderId) ||
        files.find((f) => f.id === folderId && f.type === "folder");
      if (folder) {
        const index = folderStack.findIndex((f) => f.id === folderId);
        if (index !== -1) {
          setFolderStack(folderStack.slice(0, index + 1));
        } else {
          setFolderStack([
            ...folderStack,
            { id: folder.id, name: folder.name },
          ]);
        }
      }
    }
  };

  const handleEnterFolder = (f: FileItem) => {
    setCurrentFolderId(f.id);
    setFolderStack([...folderStack, { id: f.id, name: f.name }]);
    setViewMode("files");
  };

  const handleDeleteRequest = (id: string) => {
    setFileToDelete(id);
  };

  const showProperties = (file: FileItem) => {
    setFileProperties(file);
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) performUpload(e.dataTransfer.files[0]);
  };

  if (authLoading)
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading...
      </div>
    );

  if (!isAuthenticated)
    return (
      <Login
        onLoginSuccess={(u) => {
          setIsAuthenticated(true);
          setCurrentUser(u);
          api.get("/auth/me").then((res) => {
            setDisplayName(res.data.user.displayName || "");
            setStorageInfo({
              used: res.data.user.usedStorage || 0,
              limit: res.data.user.storageLimit || 0,
            });
            if (res.data.user.avatar) {
              const avatar = res.data.user.avatar;
              setUserAvatar(
                avatar.startsWith("http")
                  ? avatar
                  : `${api.defaults.baseURL}/uploads/avatars/${avatar}`,
              );
            }
          });
        }}
      />
    );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 relative">
      {/* GLOBAL SONNER TOASTER */}
      <Toaster richColors position="bottom-right" closeButton />

      {/* MODALS */}
      {selectedFile && (
        <PreviewModal
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
        />
      )}
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
      {fileToDelete && (
        <DeleteModal
          onConfirm={handleDelete}
          onCancel={() => setFileToDelete(null)}
        />
      )}

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

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updatedUser: {
            username?: string;
            displayName?: string | null;
            avatar?: string | null;
          }) => {
            if (updatedUser?.username) {
              setCurrentUser(updatedUser.username);
            }
            if (updatedUser?.displayName !== undefined) {
              setDisplayName(updatedUser.displayName || "");
            }
            if (updatedUser?.avatar) {
              setUserAvatar(updatedUser.avatar);
            }
          }}
        />
      )}

      {/* Global shadcn/ui Dialog for New Folder Action */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Buat Folder Baru</DialogTitle>
            <DialogDescription>
              Masukkan nama folder baru yang ingin Anda buat di direktori saat
              ini.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateFolderSubmit}>
            <div className="grid gap-4 py-4">
              <input
                type="text"
                placeholder="Nama Folder"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent transition-all"
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
      />

      <main
        className="flex-1 p-8 overflow-y-auto h-screen relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="fixed inset-0 z-50 bg-blue-500/10 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex items-center justify-center pointer-events-none">
            <div className="bg-white p-8 rounded-full shadow-2xl animate-bounce">
              <Cloud size={64} className="text-blue-500" />
            </div>
          </div>
        )}

        <Header
          onSearch={handleSearch}
          searchQuery={searchQuery}
          onLogout={handleLogout}
          title={
            viewMode === "trash"
              ? "Trash"
              : viewMode === "favorites"
                ? "Favorites"
                : viewMode === "recent"
                  ? "Recent"
                  : currentFolderId
                    ? folderStack[folderStack.length - 1]?.name
                    : "My Files"
          }
          onEmptyTrash={handleEmptyTrash}
        />

        <div className="flex-1 p-6">
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
          />
        </div>
      </main>

      {/* BULK ACTIONS FLOATING TOOLBAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200/80 px-6 py-3.5 rounded-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="text-sm font-semibold text-slate-700 select-none border-r pr-4 border-slate-200">
            {selectedIds.size} selected
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                setFilesToMove(files.filter((f) => selectedIds.has(f.id)))
              }
              className="px-4 py-2 hover:bg-slate-100 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 transition-all flex items-center gap-2 cursor-pointer"
            >
              <FolderInput size={16} /> Move
            </button>
            {viewMode === "files" && (
              <button
                onClick={handleBulkDownload}
                className="px-4 py-2 hover:bg-slate-100 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download size={16} /> Download
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 hover:bg-red-50 rounded-xl text-sm font-semibold text-red-600 hover:text-red-700 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
          <button
            onClick={handleClearSelection}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
            title="Clear Selection"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
