import React, { useEffect, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  AlertTriangle, Radio, Clock, ShieldCheck, ArrowLeft,
  ChevronUp, ChevronDown, RefreshCw, Signal
} from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { formatTimeHHMM, calculateProgramProgress } from '../utils/dateUtils';

const FALLBACK_STREAM_URL = "http://bore.pub:30113/hls/index.m3u8";
const CHRTV_LOGO_URL = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

/**
 * Hàm generateCatchupUrl - Nối chuỗi timestamp để phát lại (Catchup / Timeshift)
 * @param {string} baseUrl - URL luồng stream gốc
 * @param {string|number|Date} timestamp - Mốc thời gian xem lại
 * @param {string} catchupType - Kiểu catchup ('append', 'flussonic', 'shift', 'default')
 * @returns {string} - URL stream đã được nối thông số Catchup
 */
export function generateCatchupUrl(baseUrl, timestamp, catchupType = 'append') {
  if (!baseUrl) return '';
  if (!timestamp) return baseUrl;

  let utcSec = Math.floor(Date.now() / 1000);
  let dateObj = new Date();

  if (typeof timestamp === 'number') {
    utcSec = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
    dateObj = new Date(utcSec * 1000);
  } else if (timestamp instanceof Date) {
    dateObj = timestamp;
    utcSec = Math.floor(timestamp.getTime() / 1000);
  } else if (typeof timestamp === 'string') {
    if (/^\d{14}$/.test(timestamp)) {
      const year = parseInt(timestamp.substring(0, 4), 10);
      const month = parseInt(timestamp.substring(4, 6), 10) - 1;
      const day = parseInt(timestamp.substring(6, 8), 10);
      const hour = parseInt(timestamp.substring(8, 10), 10);
      const min = parseInt(timestamp.substring(10, 12), 10);
      const sec = parseInt(timestamp.substring(12, 14), 10);
      dateObj = new Date(Date.UTC(year, month, day, hour - 7, min, sec));
      utcSec = Math.floor(dateObj.getTime() / 1000);
    } else if (!isNaN(Number(timestamp))) {
      utcSec = parseInt(timestamp, 10);
      dateObj = new Date(utcSec * 1000);
    } else {
      dateObj = new Date(timestamp);
      utcSec = Math.floor(dateObj.getTime() / 1000);
    }
  }

  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = dateObj.getFullYear();
  const MM = pad(dateObj.getMonth() + 1);
  const DD = pad(dateObj.getDate());
  const hh = pad(dateObj.getHours());
  const mm = pad(dateObj.getMinutes());
  const ss = pad(dateObj.getSeconds());
  const formattedYMDHMS = `${YYYY}${MM}${DD}${hh}${mm}${ss}`;

  const separator = baseUrl.includes('?') ? '&' : '?';

  if (catchupType === 'flussonic' || baseUrl.includes('timeshift')) {
    return baseUrl.replace(/\/index\.m3u8$/i, '') + `/timeshift_abs-${utcSec}.m3u8`;
  } else if (catchupType === 'shift') {
    return `${baseUrl}${separator}shift=${utcSec}`;
  } else {
    return `${baseUrl}${separator}utc=${utcSec}&lutc=${Math.floor(Date.now() / 1000)}&catchup_start=${formattedYMDHMS}`;
  }
}

/**
 * Thành phần VideoPlayer tích hợp Shaka Player & Auto-Fallback
 */
export default function VideoPlayer({
  channel,
  streamUrl,
  epgNow,
  epgNext,
  isCatchupMode = false,
  catchupProgram = null,
  onNextChannel,
  onPrevChannel,
  onClose,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const shakaPlayerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isFallbackActive, setIsFallbackActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeUrl, setActiveUrl] = useState(streamUrl || FALLBACK_STREAM_URL);

  const overlayTimerRef = useRef(null);

  // Khởi tạo Shaka Player Polyfill
  useEffect(() => {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      console.warn("Trình duyệt không hỗ trợ Shaka Player đầy đủ, đang chạy chế độ tương thích.");
    }
  }, []);

  // Xử lý tự động ẩn Overlay UI sau 5 giây không tương tác
  const resetOverlayTimer = useCallback(() => {
    setShowOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 5000);
  }, []);

  useEffect(() => {
    resetOverlayTimer();
    const handleMouseMove = () => resetOverlayTimer();
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [resetOverlayTimer]);

  // Khởi tạo và load luồng bằng Shaka Player
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let player = shakaPlayerRef.current;
    if (!player) {
      player = new shaka.Player(videoElement);
      shakaPlayerRef.current = player;

      // Cấu hình Shaka Player tối ưu cho HLS delay thấp
      player.configure({
        streaming: {
          rebufferingGoal: 2,
          bufferingGoal: 10,
          bufferBehind: 15,
          lowLatencyMode: true,
          autoLowLatencyMode: true,
          jumpLargeGaps: true,
        },
        manifest: {
          retryParameters: {
            maxAttempts: 3,
            baseDelay: 1000,
            backoffFactor: 2,
          }
        }
      });
    }

    const currentTargetUrl = streamUrl || FALLBACK_STREAM_URL;
    setActiveUrl(currentTargetUrl);
    setIsFallbackActive(false);
    setErrorMessage(null);
    setIsBuffering(true);

    const loadStream = async (targetUrl, isFallback = false) => {
      try {
        await player.load(targetUrl);
        videoElement.play().catch(() => setIsPlaying(false));
        setIsBuffering(false);
      } catch (error) {
        console.error("Shaka Player Error:", error);
        if (!isFallback) {
          console.warn("Luồng chính bị lỗi, tự động kích hoạt Fallback Backup Stream:", FALLBACK_STREAM_URL);
          setIsFallbackActive(true);
          setErrorMessage("Luồng chính gián đoạn. Tự động chuyển luồng dự phòng CHRTV.");
          try {
            await player.load(FALLBACK_STREAM_URL);
            videoElement.play().catch(() => {});
            setIsBuffering(false);
          } catch (fallbackError) {
            console.error("Fallback Stream Error:", fallbackError);
            setErrorMessage("Không thể kết nối cả luồng chính và luồng dự phòng.");
            setIsBuffering(false);
          }
        } else {
          setErrorMessage("Lỗi kết nối phát video.");
          setIsBuffering(false);
        }
      }
    };

    loadStream(currentTargetUrl);

    // Lắng nghe sự kiện lỗi của Shaka Player
    const onErrorEvent = (event) => {
      console.warn("Shaka Player onErrorEvent:", event.detail);
      if (!isFallbackActive) {
        setIsFallbackActive(true);
        loadStream(FALLBACK_STREAM_URL, true);
      }
    };

    const onBufferingEvent = (event) => {
      setIsBuffering(event.buffering);
    };

    player.addEventListener('error', onErrorEvent);
    player.addEventListener('buffering', onBufferingEvent);

    return () => {
      if (player) {
        player.removeEventListener('error', onErrorEvent);
        player.removeEventListener('buffering', onBufferingEvent);
      }
    };
  }, [streamUrl]);

  // Điều khiển Play / Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Điều khiển Mute / Unmute
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  // Thao tác Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
      setIsFullscreen(false);
    }
  };

  // Xử lý phím Remote TV D-pad
  useEffect(() => {
    const handleKeyDown = (e) => {
      resetOverlayTimer();
      switch (e.key) {
        case 'MediaPlayPause':
        case ' ':
          togglePlay();
          break;
        case 'ArrowUp':
          if (onPrevChannel) onPrevChannel();
          break;
        case 'ArrowDown':
          if (onNextChannel) onNextChannel();
          break;
        case 'Escape':
        case 'BackSpace':
          if (onClose) onClose();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetOverlayTimer, onPrevChannel, onNextChannel, onClose]);

  const nowProgress = epgNow ? calculateProgramProgress(epgNow.start, epgNow.stop) : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group select-none"
    >
      {/* HTML5 Video Element cho Shaka Player */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
      />

      {/* Spinner Loading & Buffering */}
      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 backdrop-blur-sm">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="mt-4 text-slate-200 font-semibold text-lg tracking-wide">
            Đang tải dữ liệu luồng TV...
          </span>
        </div>
      )}

      {/* Thông báo Fallback Backup Stream */}
      {isFallbackActive && (
        <div className="absolute top-20 right-6 z-30 bg-amber-600/90 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xl backdrop-blur-md animate-pulse">
          <AlertTriangle className="w-5 h-5 text-yellow-300" />
          <span className="text-sm font-medium">Đang phát luồng dự phòng CHRTV</span>
        </div>
      )}

      {/* Overlays UI Gradient */}
      <div
        className={`absolute inset-0 z-10 transition-opacity duration-300 pointer-events-none ${
          showOverlay ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Overlay */}
        <div className="absolute top-0 left-0 right-0 p-6 overlay-gradient-top flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
            {onClose && (
              <FocusableWrapper
                onClick={onClose}
                className="p-2.5 rounded-full bg-black/40 hover:bg-red-600/80 text-white transition-all"
              >
                <ArrowLeft className="w-6 h-6" />
              </FocusableWrapper>
            )}

            {/* Logo CHRTV Chính Thức */}
            <img
              src={CHRTV_LOGO_URL}
              alt="CHRTV Logo"
              className="h-10 object-contain drop-shadow-md"
            />

            <div className="h-6 w-px bg-slate-700/80 my-auto"></div>

            {/* Logo Kênh & Tên Kênh */}
            <div className="flex items-center gap-3">
              {channel?.logo ? (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  className="w-12 h-12 object-contain rounded-lg bg-slate-900/80 p-1 border border-slate-700/50"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : null}
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide drop-shadow">
                  {channel?.name || 'Kênh Truyền Hình CHRTV'}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-600 text-white uppercase tracking-wider">
                    {channel?.group_title || 'LIVE'}
                  </span>
                  {isCatchupMode ? (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-600 text-white flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Xem Lai (Catchup)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-600 text-white flex items-center gap-1">
                      <Radio className="w-3 h-3 animate-pulse" /> TRỰC TIẾP
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Icon Trạng Thái Tín Hiệu */}
          <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-full border border-slate-700/40">
            <Signal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-300 font-medium">HLS 1080p60</span>
          </div>
        </div>

        {/* Bottom Control Bar Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 overlay-gradient-bottom pointer-events-auto">
          {/* EPG Info Card (Chương trình đang phát & Tiếp theo) */}
          <div className="mb-4 bg-slate-900/80 backdrop-blur-md rounded-2xl p-4 border border-slate-800/80 shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* EPG NOW */}
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">
                  <Clock className="w-3.5 h-3.5" /> Đang Phát (EPG Now)
                </div>
                <h3 className="text-lg font-bold text-white truncate">
                  {isCatchupMode && catchupProgram ? catchupProgram.title : (epgNow?.title || 'Chương trình truyền hình tổng hợp CHRTV')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                  {epgNow ? `${formatTimeHHMM(epgNow.start)} - ${formatTimeHHMM(epgNow.stop)} | ${epgNow.desc}` : 'Bản tin tin tức và giải trí trực tuyến.'}
                </p>

                {/* EPG Progress Bar */}
                {epgNow && (
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-red-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${nowProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>

              {/* EPG NEXT */}
              {epgNext && !isCatchupMode && (
                <div className="md:w-1/3 border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Tiếp Theo (EPG Next)
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200 truncate">
                    {epgNext.title}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bắt đầu lúc {formatTimeHHMM(epgNext.start)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Nút Play / Pause */}
              <FocusableWrapper
                onClick={togglePlay}
                className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/40"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
              </FocusableWrapper>

              {/* Nút Mute / Unmute */}
              <FocusableWrapper
                onClick={toggleMute}
                className="p-3 rounded-full bg-slate-800/80 text-slate-200 hover:bg-slate-700"
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              </FocusableWrapper>

              {/* Nút Kênh Trước / Kênh Sau */}
              {onPrevChannel && (
                <FocusableWrapper
                  onClick={onPrevChannel}
                  className="p-3 rounded-full bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                >
                  <ChevronUp className="w-5 h-5" />
                </FocusableWrapper>
              )}

              {onNextChannel && (
                <FocusableWrapper
                  onClick={onNextChannel}
                  className="p-3 rounded-full bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                >
                  <ChevronDown className="w-5 h-5" />
                </FocusableWrapper>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Nút Fullscreen */}
              <FocusableWrapper
                onClick={toggleFullscreen}
                className="p-3 rounded-full bg-slate-800/80 text-slate-200 hover:bg-slate-700"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </FocusableWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
