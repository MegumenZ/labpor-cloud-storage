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

function App() {
  // --- STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ used: number; limit: number }>({
    used: 0,
    limit: 0,
  });
  const [authLoading, setAuthLoading] = useState(true);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"files" | "trash">("files");

  // Modal States
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [filesToMove, setFilesToMove] = useState<FileItem[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [fileProperties, setFileProperties] = useState<FileItem | null>(null);

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
                  : `${api.defaults.baseURL}/uploads/avatars/${avatar}`
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
      if (searchQuery) {
        params.search = searchQuery;
      } else if (viewMode === "trash") {
        params.trash = "true";
      } else if (currentFolderId) {
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
    if (isAuthenticated) fetchFiles();
  }, [fetchFiles, isAuthenticated]);

  // --- HANDLERS ---
  const performUpload = async (file: globalThis.File) => {
    // Frontend validation (5GB limit for large Ceph uploads)
    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
    if (file.size > MAX_SIZE) {
      alert("File size exceeds the 5GB limit!");
      return;
    }
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
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Upload failed";
      alert(message);
    }
  };

  const handleLogout = async () => {
    await api.post("/auth/logout").catch(() => { });
    localStorage.removeItem("token");
    setIsAuthenticated(false);
  };
  const handleCreateFolder = async () => {
    const name = prompt("Name:");
    if (name) {
      await api.post("/files/folder", { name, parentId: currentFolderId });
      fetchFiles();
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
      await api.delete(`/files/${fileToDelete}`, {
        params: { permanent: isPermanent }
      });
      setFileToDelete(null);
      fetchFiles();
    }
  };

  const handleRestore = async (id: string) => {
    await api.post(`/files/${id}/restore`);
    fetchFiles();
  };

  const handleEmptyTrash = async () => {
    if (confirm("Are you sure you want to permanently delete all items in the trash?")) {
      await api.delete("/files/trash");
      fetchFiles();
    }
  };

  const handleDownload = async (f: FileItem) => {
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
  };

  const handleRename = async (f: FileItem) => {
    const name = prompt("New Name:", f.name);
    if (name && name !== f.name) {
      await api.put(`/files/${f.id}/rename`, { newName: name });
      fetchFiles();
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
      ? `Are you sure you want to permanently delete the ${selectedIds.size} selected items?`
      : `Move the ${selectedIds.size} selected items to trash?`;

    if (confirm(confirmMsg)) {
      setLoading(true);
      try {
        await Promise.all(
          Array.from(selectedIds).map((id) =>
            api.delete(`/files/${id}`, { params: { permanent: isPermanent } })
          )
        );
        handleClearSelection();
        fetchFiles();
      } catch {
        alert("Some files failed to delete.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkDownload = async () => {
    const selectedFiles = files.filter(f => selectedIds.has(f.id));
    const selectedOnlyFiles = selectedFiles.filter(f => !f.isFolder);
    const folderCount = selectedFiles.length - selectedOnlyFiles.length;

    if (selectedOnlyFiles.length === 0) {
      alert("No files selected to download (folders cannot be downloaded directly).");
      return;
    }

    if (folderCount > 0) {
      alert(`Note: ${folderCount} folder(s) will be skipped from download.`);
    }

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
  };

  // Navigation Handlers
  const handleNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setFolderStack([]);
    } else {
      // Find the folder in the current stack or files to update the stack
      const folder = folderStack.find(f => f.id === folderId) || files.find(f => f.id === folderId && f.type === 'folder');
      if (folder) {
        const index = folderStack.findIndex(f => f.id === folderId);
        if (index !== -1) {
          setFolderStack(folderStack.slice(0, index + 1));
        } else {
          // This case should ideally not happen if navigation is always through existing stack or current files
          // But as a fallback, if we navigate to a folder not in stack, add it.
          setFolderStack([...folderStack, { id: folder.id, name: folder.name }]);
        }
      }
    }
  };

  const handleEnterFolder = (f: FileItem) => {
    setCurrentFolderId(f.id);
    setFolderStack([...folderStack, { id: f.id, name: f.name }]);
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
          // Trigger fetch profile to get avatar and display name
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
                  : `${api.defaults.baseURL}/uploads/avatars/${avatar}`
              );
            }
          });
        }}
      />
    );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 relative">
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
      {fileProperties && (
        <PropertiesModal
          file={fileProperties}
          breadcrumbs={folderStack} // Changed to folderStack
          onClose={() => setFileProperties(null)}
        />
      )}
      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updatedUser: { username?: string; displayName?: string | null; avatar?: string | null }) => {
            if (updatedUser?.username) {
              setCurrentUser(updatedUser.username);
            }
            if (updatedUser?.displayName !== undefined) {
              setDisplayName(updatedUser.displayName || "");
            }
            if (updatedUser?.avatar) {
              // If it's already a full URL (from ProfileModal), use it.
              // If it's a filename (from some other source?), construct it.
              // ProfileModal sends full URL.
              setUserAvatar(updatedUser.avatar);
            }
          }}
        />
      )}

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
        onChangeView={setViewMode}
      />

      <main
        className="flex-1 p-8 overflow-y-auto h-screen relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="fixed inset-0 z-50 bg-blue-500/10 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex items-center justify-center pointer-events-none">
            <div
              className="bg-white p-8 rounded-full shadow-2xl animate-bounce"
            >
              <Cloud size={64} className="text-blue-500" />
            </div>
          </div>
        )}

        <Header
          onSearch={handleSearch}
          onLogout={handleLogout}
          title={viewMode === "trash" ? "Trash" : (currentFolderId ? folderStack[folderStack.length - 1]?.name : "My Files")}
          onEmptyTrash={handleEmptyTrash}
        />

        <div className="flex-1 p-6">
          {/* Breadcrumb (Only show in 'files' mode) */}
          {viewMode === "files" && (
            <Breadcrumbs
              items={folderStack}
              onNavigate={handleNavigate}
            />
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
              onClick={() => setFilesToMove(files.filter(f => selectedIds.has(f.id)))}
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
