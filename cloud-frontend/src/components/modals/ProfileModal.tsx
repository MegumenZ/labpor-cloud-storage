import React, { useState, useEffect, useRef } from "react";
import {
  X,
  User,
  Folder,
  Clock,
  Loader2,
  Info,
  Camera,
  Save,
  Edit2,
} from "lucide-react";
import api from "../../api";
import type { User as UserType } from "../../types";

interface ProfileModalProps {
  onClose: () => void;
  onUpdate?: (user: UserType) => void;
}

// Helper component defined before usage or as function to avoid hoisting issues
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
    <div className="flex justify-between items-center py-1">
      <span className="text-slate-500 flex items-center gap-2 text-sm">
        {icon} {label}
      </span>
      <span className="font-medium text-slate-700 text-sm">{value}</span>
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

      const res = await api.put("/auth/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) {
        const updatedUser = res.data.data;
        // Merge with existing profile to preserve totalFiles (which isn't returned by PUT)
        setProfile((prev) => prev ? ({ ...prev, ...updatedUser }) : updatedUser);
        setIsEditing(false);

        if (onUpdate) {
          const baseUrl = api.defaults.baseURL || "http://localhost:3000";
          const fullAvatarUrl = updatedUser.avatar
            ? `${baseUrl}/uploads/avatars/${updatedUser.avatar}`
            : null;

          onUpdate({
            ...updatedUser,
            avatar: fullAvatarUrl,
          });
        }
      }
    } catch (err) {
      console.error("Failed to update profile", err);
      alert("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6 border-b pb-3">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <User size={20} /> {isEditing ? "Edit Profile" : "My Profile"}
          </h3>
          <button onClick={onClose}>
            <X size={20} className="text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-10">
            <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
            <p className="text-sm text-slate-500">Loading user data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-10">
            <p className="text-center text-red-500">
              ⚠️ Failed to load profile data.
            </p>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-100 shadow-inner bg-slate-50">
                  {previewAvatar ? (
                    <img
                      src={previewAvatar}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <User size={40} />
                    </div>
                  )}
                </div>
                {isEditing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 bg-blue-500 text-white p-2 rounded-full shadow-lg hover:bg-blue-600 transition-colors"
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
                <div className="mt-3 text-center">
                  <h2 className="text-xl font-bold text-slate-800">
                    {profile.displayName || profile.username}
                  </h2>
                  <p className="text-slate-500 text-sm">@{profile.username}</p>
                </div>
              )}
            </div>

            {/* Form / Info Section */}
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Enter your name"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <ProfileRow
                  icon={<Folder size={18} />}
                  label="Total Files"
                  value={profile.totalFiles.toLocaleString()}
                />
                <ProfileRow
                  icon={<Clock size={18} />}
                  label="Joined"
                  value={new Date(profile.createdAt).toLocaleDateString()}
                />
                <ProfileRow
                  icon={<Info size={18} />}
                  label="User ID"
                  value={profile.id.substring(0, 8) + "..."}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 border border-slate-200"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <Save size={18} />
                    )}
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 border border-slate-200"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 py-2.5 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <Edit2 size={18} /> Edit Profile
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
