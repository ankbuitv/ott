import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, RefreshCw, ExternalLink, AlertTriangle, ChevronLeft, ChevronRight, Play, Film } from 'lucide-react';
import { buildEmbedSources, openExternalSearch } from '../services/embeds';

/**
 * CHRTV - Trình phát phim (nguồn thứ 3)
 * Nhúng player từ các embed API (vidsrc fyi/top/me/hair, embed.su, 2embed,
 * multiembed, moviesapi) — tất cả chỉ cần TMDB ID. Có selector để chuyển
 * server nếu 1 server lỗi.
 */
export default function MoviePlayerModal({ movie, onClose }) {
  const isTV = movie?.media_type === 'tv';
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const sources = useMemo(() => buildEmbedSources(movie, isTV ? season : null, isTV ? episode : null), [movie, isTV, season, episode]);
  const current = sources[sourceIdx] || null;

  const switchSource = useCallback((i) => {
    setSourceIdx(i);
    setLoading(true);
    setError(false);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    // force iframe re-render by bumping a key
    setSourceIdx(prev => prev);
  }, []);

  // ESC đóng
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

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
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-stone-300 hover:text-white transition shrink-0">
          <X className="w-5 h-5" />
        </button>
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
              key={`${sourceIdx}-${season}-${episode}`}
              src={current.url}
              title={`${current.name} player`}
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
              allowFullScreen
              referrerPolicy="origin"
              onLoad={() => setLoading(false)}
            />
          )}

          {/* Loading overlay */}
          {loading && !error && (
            <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur flex flex-col items-center justify-center">
              <div className="w-14 h-14 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-xs text-stone-400">Đang tải {current?.name}…</p>
              <p className="text-[10px] text-stone-600 mt-1">Nếu lâu quá, chuyển server bên dưới</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black px-6 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Server {current?.name} không phát được</h3>
              <p className="text-xs text-stone-500 mb-4 max-w-sm">Nguồn này có thể đang lỗi hoặc hết phim. Thử server khác bên dưới.</p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <button onClick={reload} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Tải lại
                </button>
                <button onClick={() => openExternalSearch(movie)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
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
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                  i === sourceIdx
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'
                }`}
              >
                {i + 1}. {s.name}
              </button>
            ))}
            <button onClick={reload} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-stone-400 hover:text-white hover:bg-white/10 border border-white/10 whitespace-nowrap flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Reload
            </button>
          </div>
          <p className="text-[9px] text-stone-600 mt-1.5">Nguồn thứ 3 (embed API) — nếu 1 server lỗi, bấm số khác để chuyển. Nút Reload tải lại player hiện tại.</p>
        </div>
      </div>
    </div>
  );
}
