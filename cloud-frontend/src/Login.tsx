import { useState } from "react";
import { Cloud, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import api from "./api";

interface LoginProps {
  onLoginSuccess: (username: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister ? { username, password, displayName } : { username, password };
      const response = await api.post(endpoint, payload);

      if (response.data.success) {
        if (isRegister) {
          setIsRegister(false);
          setError("Pendaftaran berhasil! Silakan masuk.");
        } else {
          onLoginSuccess(response.data.username);
        }
      }
    } catch (err) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Terjadi kesalahan pada sistem. Silakan coba kembali.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center p-4 relative overflow-hidden animate-gradient-shift">
      {/* Decorative Glow Ambient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="backdrop-blur-xl bg-white/5 w-full max-w-md rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-500 z-10">
        
        {/* Brand Header */}
        <div className="bg-white/5 p-8 text-center border-b border-white/5 backdrop-blur-md">
          <div className="bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-lg shadow-white/5 group-hover:scale-105 transition-transform duration-300">
            <Cloud size={32} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            SkyStore
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            Private Secure Cloud Storage
          </p>
        </div>

        {/* Input Form Body */}
        <div className="p-8">
          <h2 className="text-xl font-bold text-white mb-6 text-center">
            {isRegister ? "Buat Akun Baru" : "Selamat Datang Kembali"}
          </h2>

          {error && (
            <div
              className={`p-3 rounded-xl text-sm mb-6 border animate-in fade-in duration-300 ${
                error.includes("berhasil")
                  ? "bg-green-500/10 text-green-300 border-green-500/20"
                  : "bg-red-500/10 text-red-300 border-red-500/20"
              }`}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="animate-in slide-in-from-top-3 duration-300">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Nama Tampilan
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-3.5 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/10 focus:border-blue-400/50 transition-all duration-300"
                    placeholder="Masukkan nama Anda"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-3.5 text-slate-400"
                  size={18}
                />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/10 focus:border-blue-400/50 transition-all duration-300"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-3.5 text-slate-400"
                  size={18}
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/10 focus:border-blue-400/50 transition-all duration-300"
                  placeholder="Masukkan password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 hover:shadow-blue-500/25 hover:shadow-lg text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 mt-6 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer shadow-md"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {isRegister ? "Daftar" : "Masuk"} <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-center mt-6 text-slate-400 text-sm">
            {isRegister ? "Sudah memiliki akun?" : "Belum memiliki akun?"}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
              }}
              className="text-blue-400 font-bold ml-1 hover:text-blue-300 transition-colors cursor-pointer"
            >
              {isRegister ? "Masuk di sini" : "Daftar sekarang"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
