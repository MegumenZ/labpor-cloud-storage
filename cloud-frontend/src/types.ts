export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: string;
  createdAt: string;
  isFolder: boolean;
  parentId: string | null;
  previewUrl?: string | null;
  isDeleted?: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  createdAt: string;
  totalFiles: number;
  usedStorage?: number;
  storageLimit?: number;
}
