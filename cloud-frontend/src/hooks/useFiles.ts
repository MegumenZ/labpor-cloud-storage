import { useState, useEffect, useCallback } from "react";
import api from "../api";
import type { FileItem } from "../types";
import { toast } from "sonner";

export interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  controller: AbortController;
}

export function useFiles(
  isAuthenticated: boolean,
  isStorageOnline: boolean,
  refreshStorageInfo: () => Promise<void>,
  storageUsed: number,
  storageLimit: number
) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [storageErrorConfig, setStorageErrorConfig] = useState<{ fileSize: number; availableStorage: number; limit: number; absoluteMax?: boolean } | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("folder");
  });
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>(() => {
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get("folder");
    if (!folderId) return [];

    try {
      const stored = sessionStorage.getItem("folderStack");
      if (stored) {
        const parsed = JSON.parse(stored) as { id: string; name: string }[];
        if (parsed.length > 0 && parsed[parsed.length - 1].id === folderId) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [{ id: folderId, name: "Folder" }];
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"files" | "trash" | "favorites">("files");

  // Selection States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Upload Queue State
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  // Modal States
  const [confirmDeleteConfig, setConfirmDeleteConfig] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [filesToMove, setFilesToMove] = useState<FileItem[]>([]);
  const [fileToRename, setFileToRename] = useState<FileItem | null>(null);
  const [fileProperties, setFileProperties] = useState<FileItem | null>(null);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [isDragging, setIsDragging] = useState(false);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const cancelUpload = useCallback((id: string) => {
    setUploadingFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) {
        file.controller.abort();
      }
      return prev.filter((f) => f.id !== id);
    });
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
      }

      if (searchQuery) {
        params.search = searchQuery;
      } else if (
        viewMode !== "trash" &&
        viewMode !== "favorites" &&
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

  useEffect(() => {
    setSearchQuery("");
  }, [currentFolderId, viewMode]);

  useEffect(() => {
    if (isAuthenticated) fetchFiles();
  }, [fetchFiles, isAuthenticated]);

  useEffect(() => {
    handleClearSelection();
  }, [currentFolderId, viewMode, searchQuery, handleClearSelection]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const folderId = params.get("folder");
      setCurrentFolderId(folderId);

      if (folderId === null) {
        setFolderStack([]);
      } else {
        try {
          const stored = sessionStorage.getItem("folderStack");
          if (stored) {
            const parsed = JSON.parse(stored) as { id: string; name: string }[];
            const idx = parsed.findIndex((item) => item.id === folderId);
            if (idx !== -1) {
              setFolderStack(parsed.slice(0, idx + 1));
              return;
            }
          }
        } catch (e) {
          console.error(e);
        }
        setFolderStack([{ id: folderId, name: "Folder" }]);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const performUpload = async (file: globalThis.File) => {
    if (!isStorageOnline) {
      toast.error("Layanan penyimpanan sedang terganggu. Unggahan dibatalkan.");
      return;
    }

    const MAX_SIZE = 500 * 1024 * 1024 * 1024; // 500GB
    if (file.size > MAX_SIZE) {
      setStorageErrorConfig({
        fileSize: file.size,
        availableStorage: storageLimit - storageUsed,
        limit: storageLimit,
        absoluteMax: true,
      });
      return;
    }

    const availableStorage = storageLimit - storageUsed;
    if (file.size > availableStorage) {
      setStorageErrorConfig({
        fileSize: file.size,
        availableStorage,
        limit: storageLimit,
        absoluteMax: false,
      });
      return;
    }

    const uploadId = crypto.randomUUID();
    const controller = new AbortController();
    const tempUrl = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append("file", file);
    if (currentFolderId) formData.append("parentId", currentFolderId);

    // Tambahkan ke antrean upload
    setUploadingFiles((prev) => [
      ...prev,
      { id: uploadId, name: file.name, progress: 0, controller },
    ]);

    try {
      const res = await api.post("/files/upload", formData, {
        withCredentials: true,
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.id === uploadId ? { ...f, progress: percentCompleted } : f
              )
            );
          }
        },
      });
      const newFile = { ...res.data.data, previewUrl: tempUrl };
      setFiles((prev) => [newFile, ...prev]);
      toast.success(`Berkas "${file.name}" berhasil diunggah!`);
      refreshStorageInfo();
    } catch (err: any) {
      if (err.name === "CanceledError" || err.message === "canceled" || controller.signal.aborted) {
        toast.info(`Unggahan berkas "${file.name}" dibatalkan.`);
      } else {
        const message =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
          "Gagal mengunggah berkas";
        toast.error(message);
      }
    } finally {
      // Hapus dari antrean upload
      setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId));
    }
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      performUpload(e.target.files[0]);
      e.target.value = "";
    }
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
        parentId: currentFolderId || undefined,
      });
      toast.success(`Folder "${newFolderName}" berhasil dibuat!`, {
        id: toastId,
      });
      setIsNewFolderOpen(false);
      setNewFolderName("");
      fetchFiles();
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat folder baru", { id: toastId });
    }
  };

  const handleRestore = async (id: string) => {
    const toastId = toast.loading("Memulihkan berkas...");
    try {
      await api.post(`/files/${id}/restore`);
      fetchFiles();
      toast.success("Berkas berhasil dipulihkan!", { id: toastId });
      refreshStorageInfo();
    } catch (err) {
      console.error(err);
      toast.error("Gagal memulihkan berkas", { id: toastId });
    }
  };

  const handleEmptyTrash = () => {
    setConfirmDeleteConfig({
      title: "Kosongkan Trash?",
      description: "Apakah Anda yakin ingin menghapus permanen semua item di dalam Trash? Tindakan ini tidak dapat dibatalkan.",
      confirmLabel: "Hapus Permanen",
      onConfirm: async () => {
        const toastId = toast.loading("Mengosongkan Trash...");
        try {
          await api.delete("/files/trash");
          fetchFiles();
          toast.success("Trash berhasil dikosongkan!", { id: toastId });
          refreshStorageInfo();
        } catch (err) {
          console.error(err);
          toast.error("Gagal mengosongkan Trash", { id: toastId });
        } finally {
          setConfirmDeleteConfig(null);
        }
      }
    });
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
      window.URL.revokeObjectURL(url);
      toast.success(`Selesai mengunduh "${f.name}"`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`Gagal mengunduh "${f.name}"`, { id: toastId });
    }
  };

  const handleRename = (f: FileItem) => {
    setFileToRename(f);
  };

  const handleToggleFavorite = async (file: FileItem) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === file.id ? { ...f, isFavorite: !f.isFavorite } : f
      )
    );
    try {
      await api.patch(`/files/${file.id}/favorite`);
      toast.success(
        file.isFavorite ? "Dihapus dari Favorit" : "Ditambahkan ke Favorit"
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, isFavorite: !!file.isFavorite } : f
        )
      );
      toast.error("Gagal memperbarui status favorit");
    }
  };

  const handleToggleLock = async (file: FileItem) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === file.id ? { ...f, allowEdit: !f.allowEdit } : f
      )
    );
    try {
      await api.patch(`/files/${file.id}/toggle-lock`);
      toast.success(
        file.allowEdit ? "Berkas dikunci (read-only)" : "Kunci berkas dibuka (kolaboratif)"
      );
    } catch (err) {
      console.error("Failed to toggle lock:", err);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, allowEdit: !!file.allowEdit } : f
        )
      );
      toast.error("Gagal mengubah status kunci berkas");
    }
  };

  const handleChangeView = (mode: "files" | "trash" | "favorites") => {
    setViewMode(mode);
    if (mode !== "files") {
      setCurrentFolderId(null);
      setFolderStack([]);
      sessionStorage.removeItem("folderStack");

      const url = new URL(window.location.href);
      url.searchParams.delete("folder");
      window.history.pushState({ folderId: null }, "", url.pathname + url.search);
    }
  };

  const prepareMove = (file: FileItem) => {
    setFilesToMove([file]);
  };

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

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const isPermanent = viewMode === "trash";
    setConfirmDeleteConfig({
      title: isPermanent ? "Hapus Permanen?" : "Pindahkan ke Trash?",
      description: isPermanent
        ? `Apakah Anda yakin ingin menghapus permanen ${selectedIds.size} item terpilih? Tindakan ini tidak dapat dibatalkan.`
        : `Apakah Anda yakin ingin memindahkan ${selectedIds.size} item terpilih ke Trash? Anda masih dapat memulihkannya nanti.`,
      confirmLabel: isPermanent ? "Hapus Permanen" : "Pindahkan",
      onConfirm: async () => {
        const toastId = toast.loading(`Menghapus ${selectedIds.size} elemen terpilih...`);
        setLoading(true);
        try {
          await Promise.all(
            Array.from(selectedIds).map((id) =>
              api.delete(`/files/${id}`, { params: { permanent: isPermanent } })
            )
          );
          handleClearSelection();
          fetchFiles();
          toast.success("Item terpilih berhasil dihapus", { id: toastId });
          refreshStorageInfo();
        } catch {
          toast.error("Beberapa berkas gagal dihapus.", { id: toastId });
        } finally {
          setLoading(false);
          setConfirmDeleteConfig(null);
        }
      }
    });
  };

  const handleBulkDownload = async () => {
    const selectedFiles = files.filter((f) => selectedIds.has(f.id));
    const selectedOnlyFiles = selectedFiles.filter((f) => !f.isFolder);
    const folderCount = selectedFiles.length - selectedOnlyFiles.length;

    if (selectedOnlyFiles.length === 0) {
      toast.error(
        "Tidak ada file terpilih untuk diunduh (folder tidak dapat diunduh secara langsung)."
      );
      return;
    }

    if (folderCount > 0) {
      toast.info(`Catatan: ${folderCount} folder akan dilewati dari proses unduhan.`);
    }

    const toastId = toast.loading(`Memulai proses unduh ${selectedOnlyFiles.length} berkas...`);

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
        window.URL.revokeObjectURL(url);
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Failed to download ${f.name}:`, err);
      }
    }
    toast.success("Seluruh unduhan berhasil dijalankan!", { id: toastId });
  };

  const handleNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    let nextStack: { id: string; name: string }[] = [];
    if (folderId === null) {
      setFolderStack([]);
      sessionStorage.removeItem("folderStack");
    } else {
      const folder =
        folderStack.find((f) => f.id === folderId) ||
        files.find((f) => f.id === folderId && f.type === "folder");
      if (folder) {
        const index = folderStack.findIndex((f) => f.id === folderId);
        if (index !== -1) {
          nextStack = folderStack.slice(0, index + 1);
        } else {
          nextStack = [...folderStack, { id: folder.id, name: folder.name }];
        }
      } else {
        nextStack = [{ id: folderId, name: "Folder" }];
      }
      setFolderStack(nextStack);
      sessionStorage.setItem("folderStack", JSON.stringify(nextStack));
    }

    const url = new URL(window.location.href);
    if (folderId) {
      url.searchParams.set("folder", folderId);
    } else {
      url.searchParams.delete("folder");
    }
    window.history.pushState({ folderId }, "", url.pathname + url.search);
  };

  const handleEnterFolder = (f: FileItem) => {
    setCurrentFolderId(f.id);
    const nextStack = [...folderStack, { id: f.id, name: f.name }];
    setFolderStack(nextStack);
    sessionStorage.setItem("folderStack", JSON.stringify(nextStack));
    setViewMode("files");

    const url = new URL(window.location.href);
    url.searchParams.set("folder", f.id);
    window.history.pushState({ folderId: f.id }, "", url.pathname + url.search);
  };

  const handleDeleteRequest = (id: string) => {
    const isPermanent = viewMode === "trash";
    setConfirmDeleteConfig({
      title: isPermanent ? "Hapus Permanen?" : "Pindahkan ke Trash?",
      description: isPermanent
        ? "Apakah Anda yakin ingin menghapus item ini secara permanen? Tindakan ini tidak dapat dibatalkan."
        : "Apakah Anda yakin ingin memindahkan item ini ke Trash? Anda masih dapat memulihkannya nanti.",
      confirmLabel: isPermanent ? "Hapus Permanen" : "Pindahkan",
      onConfirm: async () => {
        const toastId = toast.loading(
          isPermanent ? "Menghapus permanen..." : "Memindahkan ke Trash..."
        );
        try {
          await api.delete(`/files/${id}`, {
            params: { permanent: isPermanent },
          });
          fetchFiles();
          toast.success(
            isPermanent
              ? "Berkas dihapus secara permanen!"
              : "Berkas dipindahkan ke Trash",
            { id: toastId }
          );
          refreshStorageInfo();
        } catch (err) {
          console.error(err);
          toast.error("Gagal menghapus berkas", { id: toastId });
        } finally {
          setConfirmDeleteConfig(null);
        }
      }
    });
  };

  const showProperties = (file: FileItem) => {
    setFileProperties(file);
  };

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

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  return {
    // Files and loading state
    files,
    loading,
    currentFolderId,
    folderStack,
    searchQuery,
    viewMode,

    // Selection state
    selectedIds,

    // Modals visibility / target states
    confirmDeleteConfig,
    setConfirmDeleteConfig,
    selectedFile,
    setSelectedFile,
    filesToMove,
    setFilesToMove,
    fileToRename,
    setFileToRename,
    fileProperties,
    setFileProperties,
    isNewFolderOpen,
    setIsNewFolderOpen,
    newFolderName,
    setNewFolderName,
    storageErrorConfig,
    setStorageErrorConfig,

    // Drag-n-drop state
    isDragging,

    // Upload state
    uploadingFiles,
    cancelUpload,

    // Core handlers
    fetchFiles,
    performUpload,
    handleUploadInput,
    handleCreateFolder,
    onCreateFolderSubmit,
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
  };
}
