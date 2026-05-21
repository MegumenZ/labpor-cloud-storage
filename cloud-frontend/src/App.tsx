import { useState, useEffect, useCallback } from "react";
import { Cloud, LayoutGrid, ChevronRight } from "lucide-react";
import Login from "./Login";
import api from "./api";
import type { FileItem } from "./types";

// Import Components
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { FileGrid } from "./components/FileGrid";
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
  const [fileToMove, setFileToMove] = useState<FileItem | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [fileProperties, setFileProperties] = useState<FileItem | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  // --- AUTH & FETCH ---
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsAuthenticated(false);
        setAuthLoading(false);
        return;
      }
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
      const params: any = {};
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
  }, [isAuthenticated, currentFolderId, searchQuery, viewMode]);

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
    } catch (err: any) {
      const message = err.response?.data?.message || "Upload failed";
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
    setFileToMove(file);
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
      {fileToMove && (
        <MoveModal
          file={fileToMove}
          onClose={() => setFileToMove(null)}
          onMoveSuccess={fetchFiles}
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
          onUpdate={(updatedUser: any) => {
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
            <div className="flex items-center gap-2 mb-6 text-sm text-slate-500">
              <button
                onClick={() => handleNavigate(null)}
                className="hover:text-blue-600 transition-colors flex items-center gap-1"
              >
                <LayoutGrid size={16} /> Home
              </button>
              {folderStack.map((folder, index) => (
                <div key={folder.id} className="flex items-center gap-2">
                  <ChevronRight size={16} className="text-slate-300" />
                  <button
                    onClick={() => handleNavigate(folder.id)}
                    className={`hover:text-blue-600 transition-colors ${index === folderStack.length - 1
                      ? "font-semibold text-slate-900"
                      : ""
                      }`}
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </div>
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
          />
        </div>
      </main>
    </div>
  );
}
export default App;
