import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, RefreshCw, ExternalLink, AlertTriangle, ChevronLeft, ChevronRight, Play, Shield, ShieldOff, SkipForward, Sparkles } from 'lucide-react';
import { buildEmbedSources, openExternalSearch } from '../services/embeds';

/**
 * CHRTV - Trình phát phim (multi-server embed)
 * Nhúng player từ các embed API — tất cả chỉ cần TMDB ID. Có selector để
 * chuyển server nếu 1 server lỗi.
 *
 * Chống quảng cáo:
 * - Nút "Chặn QC" bật sandbox cho iframe (không allow-popups / allow-top-navigation*
 *   / allow-modals / allow-downloads) => chặn pop-up, pop-under, redirect cướp trang.
 *   NHƯNG mặc định TẮT (sandbox để trống): nhiều server phát hiện iframe bị sandbox
 *   là hiện thông báo "please disable sandbox" và từ chối phát. Chỉ bật sandbox khi
 *   người xem chủ động bật "Chặn QC". Trạng thái lưu localStorage ('1' = bật).
 * - referrerPolicy="no-referrer" để không lộ trang cha cho script quảng cáo.
 * - Chặn luôn window.open ở trang cha trong lúc modal đang mở (khôi phục khi đóng).
 */

const ADBLOCK_KEY = 'chrtv_movie_adblock'; // localStorage: '1' = bật sandbox chặn QC; mặc định tắt

// Quyền sandbox tối thiểu để player chạy được nhưng KHÔNG mở được pop-up/redirect.
// Tuyệt đối không thêm: allow-popups, allow-top-navigation*, allow-modals, allow-downloads.
const SANDBOX_PERMS = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock';

export default function MoviePlayerModal({ movie, onClose }) {
  const isTV = movie?.media_type === 'tv';
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // tăng dần để ép iframe mount lại
  // Chặn quảng cáo (sandbox iframe) — mặc định TẮT vì nhiều server báo
  // "please disable sandbox" và không phát khi iframe bị sandbox.
  const [adBlock, setAdBlock] = useState(() => {
    try { return localStorage.getItem(ADBLOCK_KEY) === '1'; } catch { return false; }
  });

  const sources = useMemo(() => buildEmbedSources(movie, isTV ? season : null, isTV ? episode : null), [movie, isTV, season, episode]);
  const current = sources[sourceIdx] || null;

  const switchSource = useCallback((i) => {
    setSourceIdx(i);
    setLoading(true);
    setError(false);
  }, []);

  // Chuyển sang server kế tiếp trong danh sách (dùng ở màn hình lỗi)
  const nextSource = useCallback(() => {
    setSourceIdx(prev => (prev + 1) % Math.max(1, sources.length));
    setLoading(true);
    setError(false);
  }, [sources.length]);

  // Tải lại player hiện tại: tăng reloadKey để key iframe đổi => mount lại thật sự
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    setReloadKey(k => k + 1);
  }, []);

  // Bật/tắt chặn quảng cáo (sandbox iframe) — lưu localStorage, mount lại iframe
  const toggleAdBlock = useCallback(() => {
    setAdBlock(prev => {
      const next = !prev;
      try { localStorage.setItem(ADBLOCK_KEY, next ? '1' : '0'); } catch { /* bỏ qua */ }
      return next;
    });
    setLoading(true);
    setError(false);
    setReloadKey(k => k + 1);
  }, []);

  // ESC đóng
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Chặn window.open ở trang cha khi modal đang mở (script QC hay lợi dụng),
  // khôi phục nguyên trạng khi đóng modal.
  useEffect(() => {
    const originalOpen = window.open;
    window.open = function blockedOpen() {
      console.warn('[CHRTV] Đã chặn window.open trong lúc xem phim (chống pop-up quảng cáo).');
      return null;
    };
    return () => { window.open = originalOpen; };
  }, []);

  // Timeout ~20s: nếu iframe chưa load xong thì coi như server lỗi
  const loadTimerRef = useRef(null);
  useEffect(() => {
    if (!loading || error) return undefined;
    loadTimerRef.current = setTimeout(() => {
      setLoading(false);
      setError(true);
    }, 20000);
    return () => clearTimeout(loadTimerRef.current);
  }, [loading, error, sourceIdx, season, episode, reloadKey, adBlock]);

  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-black/95 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 fill-current" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm md:text-base font-black text-white truncate">{movie.title || movie.name}</h2>
            <p className="text-[10px] text-stone-500 truncate">
              {isTV ? `TV Show · Tập ${episode} - Mùa ${season}` : 'Phim'}
              {' · '}{current?.name || 'nguồn'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Nút bật/tắt chặn quảng cáo (sandbox iframe) */}
          <button
            onClick={toggleAdBlock}
            title={adBlock ? 'Đang bật sandbox chặn QC — nếu server báo "disable sandbox" hoặc không phát, hãy tắt.' : 'Bật sandbox để chặn pop-up quảng cáo. Mặc định tắt vì nhiều server yêu cầu tắt sandbox.'}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all border ${
              adBlock
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-white/5 text-stone-400 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            {adBlock ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Chặn QC</span>
            <span>{adBlock ? 'BẬT' : 'TẮT'}</span>
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-stone-300 hover:text-white transition shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* TV season/episode picker */}
        {isTV && (
          <div className="flex items-center gap-2 px-4 md:px-6 py-2 bg-black/60 border-b border-white/5 shrink-0 overflow-x-auto scrollbar-none">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider whitespace-nowrap">Mùa</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setSeason(s => Math.max(1, s - 1))} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-xs font-bold text-white w-6 text-center">{season}</span>
              <button onClick={() => setSeason(s => s + 1)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider whitespace-nowrap ml-3">Tập</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setEpisode(e => Math.max(1, e - 1))} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-xs font-bold text-white w-6 text-center">{episode}</span>
              <button onClick={() => setEpisode(e => e + 1)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}

        {/* Player area */}
        <div className="flex-1 relative bg-black flex items-center justify-center min-h-0">
          {current && (
            <iframe
              // key chứa cả reloadKey + adBlock: đổi trạng thái là iframe mount lại
              key={`${sourceIdx}-${season}-${episode}-${reloadKey}-${adBlock ? 'ab1' : 'ab0'}`}
              src={current.url}
              title={`${current.name} player`}
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
              allowFullScreen
              referrerPolicy="origin"
              // sandbox KHÔNG cấp allow-popups / allow-top-navigation* / allow-modals
              // / allow-downloads => chặn pop-up, pop-under, redirect cướp trang
              {...(adBlock ? { sandbox: SANDBOX_PERMS } : {})}
              onLoad={() => setLoading(false)}
            />
          )}

          {/* Loading overlay */}
          {loading && !error && (
            <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur flex flex-col items-center justify-center">
              <div className="w-14 h-14 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-xs text-stone-400">Đang tải {current?.name}…</p>
              <p className="text-[10px] text-stone-600 mt-1">Nếu lâu quá, chuyển server bên dưới (tự báo lỗi sau 20 giây)</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black px-6 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Server {current?.name} không phát được</h3>
              <p className="text-xs text-stone-500 mb-4 max-w-sm">
                Nguồn này có thể đang lỗi hoặc hết phim.
                {adBlock
                  ? ' Nếu server báo "please disable sandbox" hoặc không phát, hãy tắt "Chặn QC" ở góc trên.'
                  : ' Thử chuyển server khác bên dưới, hoặc bấm "Mở tab mới" để xem trực tiếp trên trang nguồn.'}
              </p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <button onClick={nextSource} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <SkipForward className="w-3.5 h-3.5" /> Server kế tiếp
                </button>
                <button onClick={reload} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Tải lại
                </button>
                {current?.url && (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Mở tab mới
                  </a>
                )}
                <button onClick={() => openExternalSearch(movie)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Tìm nguồn khác
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Server selector */}
        <div className="px-4 md:px-6 py-3 bg-black/95 border-t border-white/10 shrink-0">
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mb-2">Nguồn phát ({sources.length})</p>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            {sources.map((s, i) => (
              <button
                key={s.name}
                onClick={() => switchSource(i)}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                  i === sourceIdx
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'
                }`}
              >
                {i + 1}. {s.name}
                {/* Nhãn "sạch" cho nguồn ít/không quảng cáo */}
                {s.adFree && (
                  <span className={`flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                    i === sourceIdx ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    <Sparkles className="w-2.5 h-2.5" /> sạch
                  </span>
                )}
              </button>
            ))}
            <button onClick={reload} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-stone-400 hover:text-white hover:bg-white/10 border border-white/10 whitespace-nowrap flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Reload
            </button>
          </div>
          <p className="text-[9px] text-stone-600 mt-1.5">Nguồn gắn nhãn "sạch" ít/không quảng cáo, nên thử trước. Nếu 1 server lỗi hoặc báo "disable sandbox", bấm số khác để chuyển, hoặc bật/tắt "Chặn QC" ở góc trên.</p>
        </div>
      </div>
    </div>
  );
}
