import React, { useState, useEffect, useRef } from "react";
import {
  User,
  Folder,
  Clock,
  Loader2,
  Camera,
  Save,
  Edit2,
} from "lucide-react";
import api from "../../api";
import type { User as UserType } from "../../types";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ProfileModalProps {
  onClose: () => void;
  onUpdate?: (user: UserType) => void;
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
      <span className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        {icon} {label}
      </span>
      <span className="font-semibold text-foreground text-sm">{value}</span>
    </div>
  );
}

export default function ProfileModal({ onClose, onUpdate }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/auth/profile");
      setProfile(res.data);
      setDisplayName(res.data.displayName || "");
      setPreviewAvatar(res.data.avatar || null);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      setProfile(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];

      const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        toast.error("Avatar harus berupa gambar bertipe JPEG, PNG, atau WebP!");
        e.target.value = "";
        return;
      }

      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast.error("Ukuran avatar tidak boleh melebihi 10MB!");
        e.target.value = "";
        return;
      }

      setAvatarFile(file);
      setPreviewAvatar(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("displayName", displayName);
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const res = await api.put("/auth/profile", formData);

      if (res.data.success) {
        const updatedUser = res.data.data;
        setProfile((prev) => prev ? ({ ...prev, ...updatedUser }) : updatedUser);
        setIsEditing(false);

        if (onUpdate) {
          const baseUrl = api.defaults.baseURL || (import.meta.env.DEV ? "http://localhost:3001" : "");
          const fullAvatarUrl = updatedUser.avatar
            ? (updatedUser.avatar.startsWith("http")
                ? updatedUser.avatar
                : `${baseUrl}/uploads/avatars/${updatedUser.avatar}`)
            : null;

          onUpdate({
            ...updatedUser,
            avatar: fullAvatarUrl,
          });
        }
      }
    } catch (err: any) {
      console.error("Failed to update profile", err);
      const serverMessage = err.response?.data?.message || "Failed to update profile";
      toast.error(serverMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[440px] border border-border/80 shadow-2xl rounded-2xl p-6 bg-popover text-popover-foreground animate-in zoom-in-95 duration-200">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
          <User size={22} className="text-blue-500" />
          {isEditing ? "Ubah Profil" : "Profil Saya"}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs">
          {isEditing ? "Perbarui informasi tampilan akun Anda di bawah ini." : "Detail akun dan informasi penyimpanan Anda."}
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex flex-col items-center py-10">
          <Loader2 className="animate-spin text-primary mb-4" size={32} />
          <p className="text-sm text-muted-foreground font-medium">Memuat data pengguna...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-10">
          <p className="text-center text-destructive font-medium">
            ⚠️ Gagal memuat profil pengguna.
          </p>
        </div>
      ) : profile ? (
        <div className="space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-border shadow-md bg-muted relative flex items-center justify-center">
                {previewAvatar ? (
                  <img
                    src={previewAvatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/60">
                    <User size={44} />
                  </div>
                )}
              </div>
              {isEditing && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-2.5 rounded-full shadow-lg hover:bg-primary/90 transition-colors border-2 border-background cursor-pointer"
                  title="Ganti Foto Profil"
                >
                  <Camera size={16} />
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
            {!isEditing && (
              <div className="mt-3 text-center select-none">
                <h2 className="text-lg font-bold text-foreground">
                  {profile.displayName || profile.username}
                </h2>
                <p className="text-muted-foreground text-sm">@{profile.username}</p>
              </div>
            )}
          </div>

          {/* Form / Info Section */}
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                  Nama Tampilan (Display Name)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background text-foreground rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all placeholder:text-muted-foreground/60"
                  placeholder="Masukkan nama Anda"
                  autoFocus
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1 bg-muted/40 border border-border/80 p-4 rounded-xl">
              <ProfileRow
                icon={<Folder size={18} className="text-slate-400" />}
                label="Jumlah Berkas"
                value={profile.totalFiles.toLocaleString("id-ID")}
              />
              <ProfileRow
                icon={<Clock size={18} className="text-slate-400" />}
                label="Bergabung"
                value={new Date(profile.createdAt).toLocaleDateString("id-ID", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              />

            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-border">
            {isEditing ? (
              <>
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                  className="flex-1 py-5 rounded-xl font-semibold border-border hover:bg-accent text-foreground transition-all cursor-pointer"
                  disabled={saving}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-5 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Save size={16} />
                  )}
                  Simpan Perubahan
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1 py-5 rounded-xl font-semibold border-border hover:bg-accent text-foreground transition-all cursor-pointer"
                >
                  Tutup
                </Button>
                <Button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 py-5 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Edit2 size={16} /> Ubah Profil
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </DialogContent>
  );
}
