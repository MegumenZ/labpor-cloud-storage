export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: string | number;
  createdAt: string;
  isFolder: boolean;
  parentId: string | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  isDeleted?: boolean;
  isFavorite?: boolean;
  uploaderName?: string | null;
  uploaderUsername?: string | null;
  deleterName?: string | null;
  deleterUsername?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  allowEdit?: boolean;
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
