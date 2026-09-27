import { useState, useEffect, useCallback } from "react";
import api from "../api";
import { toast } from "sonner";

export interface StorageInfo {
  used: number;
  limit: number;
}

export function formatAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("blob:")) {
    return avatar;
  }
  const cleanPath = avatar.replace(/^(uploads\/)?(avatars\/)?/, "");
  const baseUrl = api.defaults.baseURL || "";
  return `${baseUrl}/uploads/avatars/${cleanPath}`;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isStorageOnline, setIsStorageOnline] = useState<boolean>(true);
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    used: 0,
    limit: 0,
  });

  const refreshStorageInfo = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      if (res.data.authenticated) {
        setStorageInfo({
          used: res.data.user.usedStorage || 0,
          limit: res.data.user.storageLimit || 0,
        });
        setIsStorageOnline(res.data.user.storageOnline !== false);
      }
    } catch (err) {
      console.error("Gagal memperbarui info penyimpanan:", err);
    }
  }, []);

  const login = (username: string, user: any) => {
    setIsAuthenticated(true);
    setCurrentUser(username);
    setDisplayName(user.displayName || "");
    setStorageInfo({
      used: user.usedStorage || 0,
      limit: user.storageLimit || 0,
    });
    setIsStorageOnline(user.storageOnline !== false);
    setUserAvatar(formatAvatarUrl(user.avatar));
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setIsAuthenticated(false);
    setCurrentUser("");
    setDisplayName("");
    setUserAvatar(null);
    setStorageInfo({ used: 0, limit: 0 });
    toast.success("Berhasil keluar dari sistem");
  };

  const updateProfile = (updatedUser: {
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
    if (updatedUser?.avatar !== undefined) {
      setUserAvatar(formatAvatarUrl(updatedUser.avatar));
    }
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
            setIsStorageOnline(res.data.user.storageOnline !== false);
            setUserAvatar(formatAvatarUrl(res.data.user.avatar));
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

  return {
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
  };
}
