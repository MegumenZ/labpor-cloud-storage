import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Volume,
  Maximize,
  Minimize,
  Download,
  Loader2,
} from "lucide-react";

interface CustomVideoPlayerProps {
  src: string;
  name: string;
  downloadUrl?: string | null;
}

export default function CustomVideoPlayer({ src, name, downloadUrl }: CustomVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("video-player-volume");
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0);
  const [volumeHovered, setVolumeHovered] = useState(false);
  const [centerIcon, setCenterIcon] = useState<"play" | "pause" | null>(null);
  const [iconTrigger, setIconTrigger] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play / Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setCenterIcon("pause");
    } else {
      videoRef.current.play().catch(err => console.error(err));
      setCenterIcon("play");
    }
    setIconTrigger((prev) => prev + 1);
    setIsPlaying(!isPlaying);
    resetControlsTimer();
  };

  // Keyboard Shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in inputs (e.g. search, renaming)
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (!videoRef.current) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 5, duration);
          break;
        case "ArrowLeft":
          e.preventDefault();
          videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 5, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => {
            const next = Math.min(1.0, v + 0.1);
            localStorage.setItem("video-player-volume", next.toString());
            if (videoRef.current) {
              videoRef.current.volume = next;
              videoRef.current.muted = next === 0;
            }
            if (next > 0) setIsMuted(false);
            return next;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => {
            const next = Math.max(0.0, v - 0.1);
            localStorage.setItem("video-player-volume", next.toString());
            if (videoRef.current) {
              videoRef.current.volume = next;
              videoRef.current.muted = next === 0;
            }
            if (next === 0) setIsMuted(true);
            return next;
          });
          break;
        case "KeyM":
          e.preventDefault();
          toggleMute();
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying, duration]);

  // Sync volume with video on mount / changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Fullscreen changes detector
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
    resetControlsTimer();
  };

  // Timer to hide controls
  const resetControlsTimer = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
        setShowSpeedMenu(false);
      }, 2000); // Hide after 2 seconds
    }
  };

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const handleMouseLeave = () => {
    if (isPlaying) {
      setIsControlsVisible(false);
      setShowSpeedMenu(false);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const hrs = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = Math.floor(time % 60);

    const formattedMins = mins.toString().padStart(2, "0");
    const formattedSecs = secs.toString().padStart(2, "0");

    if (hrs > 0) {
      return `${hrs}:${formattedMins}:${formattedSecs}`;
    }
    return `${formattedMins}:${formattedSecs}`;
  };

  // Handle Seekbar MouseMove for dynamic tooltip
  const handleMouseMoveSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const time = Math.max(0, Math.min(pct * duration, duration));
    setHoverTime(time);
    setHoverPos(x);
  };

  const handleMouseLeaveSeek = () => {
    setHoverTime(null);
  };

  // Calculate buffer percent
  const getBufferPercent = () => {
    if (!videoRef.current || duration === 0) return 0;
    const buffered = videoRef.current.buffered;
    if (buffered.length === 0) return 0;
    
    // Find the buffered range containing currentTime or the closest one
    for (let i = 0; i < buffered.length; i++) {
      if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
        return (buffered.end(i) / duration) * 100;
      }
    }
    return 0;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferPercent = getBufferPercent();

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative flex items-center justify-center w-full h-auto max-h-[70vh] bg-black overflow-hidden group select-none transition-all duration-300"
    >
      <style>{`
        @keyframes centerIconAnim {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.15); opacity: 0.95; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        .custom-video-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          border: 1px solid rgba(0,0,0,0.15);
        }
        .custom-video-range::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          border: 1px solid rgba(0,0,0,0.15);
        }
      `}</style>

      {/* Actual Native Video Element */}
      <video
        ref={videoRef}
        src={src}
        autoPlay
        className="w-full h-auto max-h-[70vh] object-contain cursor-pointer bg-black"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
        onDurationChange={() => videoRef.current && setDuration(videoRef.current.duration)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        playsInline
      >
        Browser Anda tidak mendukung penayangan video.
      </video>

      {/* Play/Pause Transient Center Flash Action Icon */}
      {centerIcon && (
        <div
          key={`${centerIcon}-${iconTrigger}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
        >
          <div className="w-16 h-16 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white border border-white/10 shadow-2xl animate-[centerIconAnim_0.6s_ease-out_forwards]">
            {centerIcon === "play" ? (
              <Play size={28} className="fill-current ml-1" />
            ) : (
              <Pause size={28} className="fill-current" />
            )}
          </div>
        </div>
      )}

      {/* Buffering/Loading Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
          <div className="bg-black/60 p-4 rounded-2xl border border-white/10 shadow-xl backdrop-blur-sm">
            <Loader2 className="animate-spin text-white w-8 h-8" />
          </div>
        </div>
      )}

      {/* Custom Control Overlay Panel */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-4 pt-12 transition-all duration-300 z-20 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {/* Seekbar Track & Tooltip */}
        <div
          className="relative w-full group h-4 flex items-center cursor-pointer mb-3.5 select-none"
          onMouseMove={handleMouseMoveSeek}
          onMouseLeave={handleMouseLeaveSeek}
        >
          {/* Hover Time Tooltip */}
          {hoverTime !== null && (
            <div
              className="absolute bottom-6 bg-zinc-900/90 text-white font-semibold text-xs font-mono py-1 px-2.5 rounded-lg border border-white/10 -translate-x-1/2 pointer-events-none select-none z-30 shadow-2xl shadow-black/80"
              style={{ left: `${hoverPos}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Visual tracks */}
          <div className="absolute left-0 right-0 h-1 bg-white/20 rounded-full group-hover:h-1.5 transition-all overflow-hidden flex">
            {/* S3 Buffered status track */}
            <div
              className="bg-white/15 h-full rounded-full transition-all duration-300"
              style={{ width: `${bufferPercent}%` }}
            />
            {/* Current play progress track */}
            <div
              className="bg-sky-500 absolute top-0 bottom-0 left-0 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Transparent Input Slider Overlay for Native Mouse/Touch Control */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = val;
              setCurrentTime(val);
              resetControlsTimer();
            }}
            className="custom-video-range absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 cursor-pointer appearance-none z-20 transition-opacity"
          />

          {/* Visual Seek Head/Thumb */}
          <div
            className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md border border-white -translate-x-1/2 pointer-events-none scale-0 group-hover:scale-100 transition-transform duration-150 z-10"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Buttons and Settings Bar */}
        <div className="flex items-center justify-between text-white select-none">
          {/* Left Buttons: Play/Pause, Volume, Time */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? "Jeda" : "Putar"}
            >
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current" />}
            </button>

            {/* Expandable Volume Controls */}
            <div
              className="flex items-center gap-1.5"
              onMouseEnter={() => setVolumeHovered(true)}
              onMouseLeave={() => setVolumeHovered(false)}
            >
              <button
                onClick={toggleMute}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isMuted ? "Bunyikan" : "Senyapkan"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={20} />
                ) : volume < 0.3 ? (
                  <Volume size={20} />
                ) : volume < 0.7 ? (
                  <Volume1 size={20} />
                ) : (
                  <Volume2 size={20} />
                )}
              </button>

              <div
                className={`transition-all duration-300 ease-out flex items-center overflow-hidden h-6 ${
                  volumeHovered ? "w-20 opacity-100" : "w-0 opacity-0"
                }`}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    localStorage.setItem("video-player-volume", val.toString());
                    if (val > 0) setIsMuted(false);
                    if (videoRef.current) {
                      videoRef.current.volume = val;
                      videoRef.current.muted = val === 0;
                    }
                  }}
                  className="w-16 h-1 bg-white/25 accent-sky-400 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Time Indicator */}
            <span className="text-xs font-semibold font-mono text-zinc-300 select-none">
              {formatTime(currentTime)} <span className="text-zinc-500">/</span> {formatTime(duration)}
            </span>
          </div>

          {/* Right Buttons: Speed Selector, Direct S3 Download, Fullscreen */}
          <div className="flex items-center gap-3">
            {/* Speed setting Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2.5 py-1.5 hover:bg-white/10 rounded-lg text-white font-mono text-xs font-bold flex items-center gap-1 select-none cursor-pointer transition-all border border-white/5 bg-zinc-950/20"
                title="Kecepatan Pemutaran"
              >
                {playbackRate.toFixed(1)}x
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-11 right-0 bg-zinc-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 w-24 z-30 animate-in fade-in-50 slide-in-from-bottom-2 duration-150">
                  {[0.5, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        setPlaybackRate(rate);
                        if (videoRef.current) videoRef.current.playbackRate = rate;
                        setShowSpeedMenu(false);
                        resetControlsTimer();
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer text-white font-mono hover:bg-sky-500/20 hover:text-sky-400 ${
                        playbackRate === rate ? "bg-sky-500/30 text-sky-400 font-bold" : ""
                      }`}
                    >
                      {rate.toFixed(2)}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Direct S3 Download Button */}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={name}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                title="Unduh Langsung dari Cloud"
              >
                <Download size={20} />
              </a>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
