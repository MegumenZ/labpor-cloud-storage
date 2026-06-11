import { useState, useEffect, useCallback } from "react";
import api from "../api";
import type { FileItem } from "../types";
import { toast } from "sonner";

export function useFiles(
  isAuthenticated: boolean,
  isStorageOnline: boolean,
  refreshStorageInfo: () => Promise<void>
) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"files" | "trash" | "recent" | "favorites">("files");

  // Selection States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal States
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [filesToMove, setFilesToMove] = useState<FileItem[]>([]);
  const [fileProperties, setFileProperties] = useState<FileItem | null>(null);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [isDragging, setIsDragging] = useState(false);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
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

  useEffect(() => {
    setSearchQuery("");
  }, [currentFolderId, viewMode]);

  useEffect(() => {
    if (isAuthenticated) fetchFiles();
  }, [fetchFiles, isAuthenticated]);

  useEffect(() => {
    handleClearSelection();
  }, [currentFolderId, viewMode, searchQuery, handleClearSelection]);

  const performUpload = async (file: globalThis.File) => {
    if (!isStorageOnline) {
      toast.error("Layanan penyimpanan sedang terganggu. Unggahan dibatalkan.");
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
    if (file.size > MAX_SIZE) {
      toast.error("Ukuran berkas melebihi batas maksimal 5GB!");
      return;
    }

    const toastId = toast.loading(`Mengunggah berkas "${file.name}"... (0%)`);
    const tempUrl = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append("file", file);
    if (currentFolderId) formData.append("parentId", currentFolderId);

    try {
      const res = await api.post("/files/upload-local", formData, {
        withCredentials: true,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            toast.loading(`Mengunggah berkas "${file.name}"... (${percentCompleted}%)`, {
              id: toastId,
            });
          }
        },
      });
      const newFile = { ...res.data.data, previewUrl: tempUrl };
      setFiles((prev) => [newFile, ...prev]);
      toast.success(`Berkas "${file.name}" berhasil diunggah!`, {
        id: toastId,
      });
      refreshStorageInfo();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Gagal mengunggah berkas";
      toast.error(message, { id: toastId });
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

  const handleDelete = async () => {
    if (fileToDelete) {
      const isPermanent = viewMode === "trash";
      const toastId = toast.loading(
        isPermanent ? "Menghapus permanen..." : "Memindahkan ke Trash..."
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
          { id: toastId }
        );
        refreshStorageInfo();
      } catch (err) {
        console.error(err);
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
      refreshStorageInfo();
    } catch (err) {
      console.error(err);
      toast.error("Gagal memulihkan berkas", { id: toastId });
    }
  };

  const handleEmptyTrash = async () => {
    if (
      confirm(
        "Apakah Anda yakin ingin menghapus permanen semua item di dalam Trash?"
      )
    ) {
      const toastId = toast.loading("Mengosongkan Trash...");
      try {
        await api.delete("/files/trash");
        fetchFiles();
        toast.success("Trash berhasil dikosongkan!", { id: toastId });
        refreshStorageInfo();
      } catch (err) {
        console.error(err);
        toast.error("Gagal mengosongkan Trash", { id: toastId });
      }
    }
  };

  const handleDownload = async (f: FileItem) => {
    const toastId = toast.loading(`Mengunduh "${f.name}"...`);
    try {
      if (f.downloadUrl) {
        const link = document.createElement("a");
        link.href = f.downloadUrl;
        link.setAttribute("download", f.name);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success(`Selesai mengunduh "${f.name}"`, { id: toastId });
        return;
      }
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
      console.error(err);
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
        console.error(err);
        toast.error("Gagal mengubah nama berkas", { id: toastId });
      }
    }
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

  const handleChangeView = (mode: "files" | "trash" | "recent" | "favorites") => {
    setViewMode(mode);
    if (mode !== "files") {
      setCurrentFolderId(null);
      setFolderStack([]);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const isPermanent = viewMode === "trash";
    const confirmMsg = isPermanent
      ? `Apakah Anda yakin ingin menghapus permanen ${selectedIds.size} item terpilih?`
      : `Pindahkan ${selectedIds.size} item terpilih ke Trash?`;

    if (confirm(confirmMsg)) {
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
      }
    }
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
        if (f.downloadUrl) {
          const link = document.createElement("a");
          link.href = f.downloadUrl;
          link.setAttribute("download", f.name);
          document.body.appendChild(link);
          link.click();
          link.remove();
        } else {
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
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Failed to download ${f.name}:`, err);
      }
    }
    toast.success("Seluruh unduhan berhasil dijalankan!", { id: toastId });
  };

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
          setFolderStack([...folderStack, { id: folder.id, name: folder.name }]);
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

    // Drag-n-drop state
    isDragging,

    // Core handlers
    fetchFiles,
    performUpload,
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
  };
}
