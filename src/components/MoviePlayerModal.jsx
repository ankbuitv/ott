import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, Play, Shield, ShieldOff, SkipForward, Sparkles, MessageCircle } from 'lucide-react';
import { fetchMovieSources } from '../services/embeds';
import Hls from 'hls.js';
import { imgPath, MovieAPI } from '../services/tmdb';
import { useI18n } from '../contexts/I18nContext';
import { recordMovieProgress, getMovieProgress, fmtWatchSec, syncMovieProgressServer } from '../services/movieList';
import { addUsage } from '../services/prefs';
import { sendBeat } from '../services/social';
import { useProfile } from '../contexts/ProfileContext';
import { recordProfileWatch } from '../services/kids';
import CommentsBox from './CommentsBox';
import StreamWatermark from './StreamWatermark';
import { movieDeepId } from './ShareMovieModal';
import { fmtTstamp } from './Pack48Ui';

/**
 * CHRTV - Trình phát phim (nhiều nguồn, chọn server được)
 * Danh sách nguồn từ API /api/movie/sources: nguồn admin tự thêm (Admin Panel
 * → Nguồn phim) đứng trước, sau đó là nguồn free mặc định (VidSrc, 2Embed,
 * VidLink, MoviesAPI, EmbedSU, VidCore) — xem src/services/embeds.js.
 * kind 'embed' → iframe player; kind 'hls' → app tự phát bằng hls.js (không iframe).
 *
 * Chống quảng cáo:
 * - Nút "Chặn QC" bật sandbox cho iframe (không allow-popups / allow-top-navigation*
 *   / allow-modals / allow-downloads) => chặn pop-up, pop-under, redirect cướp trang.
 *   MẶC ĐỊNH BẬT. Nếu server báo "please disable sandbox" / không phát, người xem
 *   bấm "Tắt Chặn QC & thử lại" ngay trên màn lỗi. Trạng thái lưu localStorage
 *   ('1' = bật — mặc định; '0' = tắt).
 * - referrerPolicy="no-referrer" để không lộ trang cha cho script quảng cáo.
 * - Chặn luôn window.open ở trang cha trong lúc modal đang mở (khôi phục khi đóng).
 */

const ADBLOCK_KEY = 'chrtv_movie_adblock'; // localStorage: '1' = bật sandbox chặn QC; mặc định tắt

// Quyền sandbox tối thiểu để player chạy được nhưng KHÔNG mở được pop-up/redirect.
// Tuyệt đối không thêm: allow-popups, allow-top-navigation*, allow-modals, allow-downloads.
const SANDBOX_PERMS = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock';

export default function MoviePlayerModal({ movie, onClose }) {
  const { t } = useI18n();
  const isTV = movie?.media_type === 'tv';
  // Tiếp tục xem: nhớ đúng mùa/tập lần trước. Khi mở bằng mã (#A/#7/#1) mà có
  // season/episode truyền thẳng trong movie thì ưu tiên giá trị đó hơn progress local.
  const [season, setSeason] = useState(() => (movie?.season && movie.season > 0 ? movie.season : (getMovieProgress(movie)?.season || 1)));
  const [episode, setEpisode] = useState(() => (movie?.episode && movie.episode > 0 ? movie.episode : (getMovieProgress(movie)?.episode || 1)));
  const [resumed] = useState(() => getMovieProgress(movie));
  const { currentProfile } = useProfile();
  const [sourceIdx, setSourceIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // tăng dần để ép iframe mount lại
  // Chặn quảng cáo (sandbox iframe) — mặc định TẮT vì nhiều server báo
  // "please disable sandbox" và không phát khi iframe bị sandbox.
  const [adBlock, setAdBlock] = useState(() => {
    try { return localStorage.getItem(ADBLOCK_KEY) !== '0'; } catch { return true; }
  });

  // Nguồn phát lấy từ server (bảng movie_sources + allowlist CSP). Đổi mùa/tập thì
  // hỏi lại, vì với TV show URL phụ thuộc season/episode.
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const playerAreaRef = useRef(null); // vùng player — dùng cho logo watermark
  const [srcKey, setSrcKey] = useState(0); // bấm Reload ở màn "chưa có nguồn"
  // (#9/#68) Bình luận gắn phút: mở khay chat; với nguồn HLS tự phát ta theo dõi
  // posRef để auto-ghim phút đang xem mỗi 4 giây.
  const [chatOpen, setChatOpen] = useState(false);
  const [liveMin, setLiveMin] = useState(null);
  useEffect(() => {
    if (!chatOpen) { setLiveMin(null); return undefined; }
    const iv = setInterval(() => {
      const p = posRef.current;
      if (p && Number.isFinite(p) && p > 0) setLiveMin(Math.floor(p));
    }, 4000);
    return () => clearInterval(iv);
  }, [chatOpen]);

  useEffect(() => {
    let on = true;
    setSourcesLoading(true);
    setLoading(true);
    setError(false);
    setSourceIdx(0);
    fetchMovieSources(movie, isTV ? season : null, isTV ? episode : null)
      .then((list) => {
        if (!on) return;
        const arr = list || [];
        setSources(arr);
        // Có nguồn -> giữ spinner tới khi iframe onLoad; rỗng -> dừng xoay để hiện hướng dẫn
        setLoading(arr.length > 0);
      })
      .finally(() => { if (on) setSourcesLoading(false); });
    return () => { on = false; };
  }, [movie, isTV, season, episode, srcKey]);

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

  // Tải lại player hiện tại: tăng reloadKey để key iframe đổi => mount lại thật sự.
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    setReloadKey(k => k + 1);
  }, []);

  // Màn "chưa có nguồn": hỏi lại /api/movie/sources (admin vừa thêm nguồn trong lúc
  // user đang mở modal thì khỏi reload cả trang).
  const retrySources = useCallback(() => { setSrcKey(k => k + 1); }, []);

  // Không có nguồn -> lấy trailer YouTube để chiếu thay (dữ liệu TMDB, hợp pháp).
  const [trailerKey, setTrailerKey] = useState(null);
  useEffect(() => {
    if (current) { setTrailerKey(null); return undefined; } // có nguồn thật thì khỏi
    let on = true;
    MovieAPI.trailer(movie).then((v) => { if (on && v?.key) { setTrailerKey(v.key); setLoading(false); } }).catch(() => {});
    return () => { on = false; };
  }, [movie, current]);

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

  // Cộng dồn giờ xem phim (30s/lần) + heartbeat server (BXH/fan/dashboard).
  // Chỉ đếm khi ĐANG có nguồn thật: xem trailer thay thế không được tính giờ xem,
  // nếu không BXH/fan time sẽ phồ lên vì những phim chưa có nguồn.
  const watchRef = useRef({ season, episode });
  watchRef.current = { season, episode };
  const posRef = useRef(0);   // (#7) vị trí phim đang xem (giây) — hls.js báo lên
  const durRef = useRef(0);
  const hasSource = !!current;
  const pushServerProgress = useCallback(() => {
    const { season: se, episode: ep } = watchRef.current;
    syncMovieProgressServer(movie, { season: isTV ? se : 0, episode: isTV ? ep : 0, position_sec: posRef.current || 0, duration_sec: durRef.current || 0 });
  }, [movie, isTV]);
  useEffect(() => {
    if (!movie?.id || !hasSource) return undefined;
    sendBeat({ kind: 'movie', ref_id: `${movie.media_type === 'tv' ? 'tv' : 'movie'}-${movie.id}`, ref_name: movie.title || movie.name || '', seconds: 0, viewed: true });
    const iv = setInterval(() => {
      const { season: se, episode: ep } = watchRef.current;
      recordMovieProgress(movie, { sec: 30, season: isTV ? se : 0, episode: isTV ? ep : 0 });
      sendBeat({ kind: 'movie', ref_id: `${movie.media_type === 'tv' ? 'tv' : 'movie'}-${movie.id}`, ref_name: movie.title || movie.name || '', seconds: 30 });
      recordProfileWatch(currentProfile?.id || 'guest', 30, movie.title || movie.name || '');
      pushServerProgress();
      try {
        const st = JSON.parse(localStorage.getItem('chrtv_settings') || '{}');
        addUsage(30, st.dataSaver ? '480' : 'other');
      } catch {}
    }, 30000);
    return () => {
      clearInterval(iv);
      const { season: se, episode: ep } = watchRef.current;
      recordMovieProgress(movie, { sec: 15, season: isTV ? se : 0, episode: isTV ? ep : 0 });
      pushServerProgress();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, hasSource, pushServerProgress]);

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

  // Lá chắn click chống QC: vài giây đầu sau khi nguồn phát lên, một lớp trong suốt
  // nuốt mọi cú click vào vùng player — script quảng cáo hay chờ "người dùng click
  // đầu tiên" để mở pop-up/redirect. Hết giờ là thả tay điều khiển bình thường.
  const [shieldSec, setShieldSec] = useState(0);
  useEffect(() => {
    if (!current || current.kind === 'hls' || error || adBlock === false) { setShieldSec(0); return undefined; }
    setShieldSec(5);
    const iv = setInterval(() => setShieldSec((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => { clearInterval(iv); setShieldSec(0); };
  }, [current, sourceIdx, season, episode, reloadKey, error, adBlock]);

  // Timeout ~20s: nếu iframe chưa load xong thì coi như server lỗi
  // (chỉ đếm khi ĐÃ có nguồn — lúc còn gọi /api/movie/sources thì chưa tính)
  const loadTimerRef = useRef(null);
  useEffect(() => {
    if (!loading || error || sourcesLoading || !current) return undefined;
    loadTimerRef.current = setTimeout(() => {
      setLoading(false);
      setError(true);
    }, 20000);
    return () => clearTimeout(loadTimerRef.current);
  }, [loading, error, sourcesLoading, current, sourceIdx, season, episode, reloadKey, adBlock]);

  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col anim-zoom-fade">
      {/* ===== Header kính mờ + poster ===== */}
      <div className="relative shrink-0 border-b border-white/10" style={{ background: 'linear-gradient(180deg, rgba(20,12,8,.97), rgba(10,10,14,.95))' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(400px 60px at 10% 0%, rgba(243,111,33,.18), transparent 70%)' }} />
        <div className="relative flex items-center gap-3 px-3 md:px-5 py-2.5">
          <button onClick={onClose} title="Thoát" className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/[0.16] border border-white/10 flex items-center justify-center text-stone-200 hover:text-white transition active:scale-90 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          {movie.poster_path ? (
            <img src={imgPath(movie.poster_path, 'w92')} alt="" className="w-9 h-[52px] object-cover rounded-lg ring-1 ring-white/20 shrink-0 hidden sm:block" />
          ) : (
            <div className="w-9 h-[52px] rounded-lg bg-gradient-to-br from-[#f36f21] to-[#7c2d12] items-center justify-center shrink-0 hidden sm:flex">
              <Play className="w-4 h-4 fill-current text-white" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm md:text-[15px] font-black text-white truncate leading-tight">{movie.title || movie.name}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] font-bold text-stone-400">{isTV ? `TV · Mùa ${season} — Tập ${episode}` : 'Phim lẻ'}</span>
              <span className="text-[10px] text-stone-600">•</span>
              <span className="text-[10px] font-bold text-[#ff9a3d]">{current?.name || '…'}</span>
              {(resumed?.watchSec || 0) > 60 && (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-px">⏪ {fmtWatchSec(resumed.watchSec)}</span>
              )}
            </div>
          </div>
          {/* Tập tiếp (TV) */}
          {isTV && (
            <button
              onClick={() => { setEpisode(e => e + 1); setLoading(true); setError(false); }}
              className="shrink-0 px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-stone-200 text-[11px] font-black flex items-center gap-1.5 transition active:scale-95"
            >
              <SkipForward className="w-3.5 h-3.5" /><span className="hidden md:inline">Tập tiếp</span>
            </button>
          )}
          {/* Bình luận phút + voice-note (#9/#68) */}
          <button
            onClick={() => setChatOpen(v => !v)}
            title="Bình luận gắn phút — kể cả ghi chú thoại"
            className={`shrink-0 px-3 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all border active:scale-95 ${
              chatOpen ? 'bg-[#ff9a3d]/20 text-[#ffb37a] border-[#ff9a3d]/50' : 'bg-white/[0.07] text-stone-200 border-white/10 hover:text-white'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bình luận</span>
            {liveMin !== null && <span className="px-1.5 py-px rounded-md bg-[#ff9a3d]/25 font-mono text-[9px]">@{fmtTstamp(liveMin)}</span>}
          </button>
          {/* Chặn QC */}
          <button
            onClick={toggleAdBlock}
            title={adBlock ? 'Sandbox chặn QC đang BẬT — server báo "disable sandbox" hoặc không phát thì tắt và thử lại.' : 'Bật sandbox chặn pop-up quảng cáo (server phải chạy trong sandbox).'}
            className={`shrink-0 px-3 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all border active:scale-95 ${
              adBlock
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-white/[0.07] text-stone-400 border-white/10 hover:text-white'
            }`}
          >
            {adBlock ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Chặn QC</span>
            <span className={`text-[9px] px-1.5 py-px rounded-full ${adBlock ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/10 text-stone-500'}`}>{adBlock ? 'BẬT' : 'TẮT'}</span>
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-red-600/70 border border-white/10 flex items-center justify-center text-stone-300 hover:text-white transition active:scale-90 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* TV season/episode picker */}
        {isTV && (
          <div className="relative flex items-center gap-2 px-3 md:px-5 pb-2.5 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] border border-white/10 px-1.5 py-1">
              <span className="text-[9px] text-stone-500 font-black uppercase tracking-wider px-1">Mùa</span>
              <button onClick={() => setSeason(s => Math.max(1, s - 1))} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center text-white transition active:scale-90"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-[13px] font-black text-white w-7 text-center">{season}</span>
              <button onClick={() => setSeason(s => s + 1)} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center text-white transition active:scale-90"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-[#f36f21]/10 border border-[#f36f21]/30 px-1.5 py-1">
              <span className="text-[9px] text-[#ffb37a] font-black uppercase tracking-wider px-1">Tập</span>
              <button onClick={() => setEpisode(e => Math.max(1, e - 1))} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center text-white transition active:scale-90"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-[13px] font-black text-white w-7 text-center">{episode}</span>
              <button onClick={() => setEpisode(e => e + 1)} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center text-white transition active:scale-90"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Player area ===== */}
      <div ref={playerAreaRef} className="flex-1 relative bg-black flex items-center justify-center min-h-0">
        {/* Logo watermark của web — chỉ đắp lên nguồn HLS do app tự phát (kind='hls'),
            không đóng dấu lên player iframe của đối tác. */}
        {current && current.kind === 'hls' && (
          <StreamWatermark page="movie" containerRef={playerAreaRef} vod catchup />
        )}
        {sourcesLoading && (
          <div className="z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 border-4 border-[#f36f21]/25 border-t-[#f36f21] rounded-full animate-spin"></div>
            <p className="text-[12px] font-bold text-stone-300">Đang tìm nguồn phát…</p>
          </div>
        )}
        {/* Không có nguồn -> mở TRAILER (YouTube) thay vì màn trống, kèm giải thích
            thẳng thắn. Đây là lý do card phim không còn hứa "Xem phim" vô nghĩa. */}
        {!current && !sourcesLoading && (
          <div className="absolute inset-0 flex flex-col">
            {trailerKey ? (
              <>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Trailer"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  onLoad={() => setLoading(false)}
                />
                <div className="relative z-10 mt-3 mx-3 self-start flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 border border-amber-400/40 text-[11px] font-black tracking-wide text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" /> {t('movies.trailer.banner')}
                </div>
              </>
            ) : (
              <div className="m-auto z-10 max-w-sm text-center px-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-3xl mb-3">🎬</div>
                <h3 className="text-sm font-bold text-white mb-1">{t('movies.status.no_source')}</h3>
                <p className="text-xs text-stone-500">{t('movies.trailer.note')}</p>
              </div>
            )}
            <div className="relative z-10 mt-auto mb-6 mx-auto flex items-center gap-2">
              <button
                onClick={retrySources}
                className="px-4 py-2 rounded-2xl grad-brand text-white text-[12px] font-black flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại nguồn
              </button>
              <span className="text-[10px] text-stone-500 leading-snug max-w-[280px] text-left">
                Admin: thêm nguồn ở <b className="text-stone-300">Admin Panel → Nguồn phim</b> và khai domain vào secret <code className="text-stone-400">MOVIE_FRAME_SRC</code>
              </span>
            </div>
          </div>
        )}
        {current && current.kind === 'hls' && (
          <HlsPlayer
            src={current.url}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
            onProgress={(pos, dur) => { try { posRef.current = pos; durRef.current = dur; } catch {} }}
          />
        )}
        {current && current.kind !== 'hls' && (
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
        {current && loading && !error && (
          <div className="absolute inset-0 z-10 bg-black/85 backdrop-blur flex flex-col items-center justify-center px-6 text-center">
            <div className="relative mb-4">
              <div className="w-16 h-16 border-4 border-[#f36f21]/25 border-t-[#f36f21] rounded-full animate-spin"></div>
              <Play className="absolute inset-0 m-auto w-5 h-5 fill-current text-[#ff9a3d]" />
            </div>
            <p className="text-[13px] font-bold text-white">Đang tải {current?.name}…</p>
            <p className="text-[11px] text-stone-500 mt-1">Nếu lâu quá, chuyển server bên dưới (tự báo lỗi sau 20 giây)</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/95 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#14151c] p-6 text-center shadow-2xl">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-3">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>
              <h3 className="text-[15px] font-black text-white mb-1">Server {current?.name} không phát được</h3>
              <p className="text-[12px] text-stone-400 mb-4 leading-relaxed">
                Nguồn này có thể đang lỗi hoặc hết phim.
                {adBlock
                  ? ' Nếu không phát được, hãy tắt "Chặn QC" ở trên rồi thử lại trong app.'
                  : ' Thử chuyển server khác bên dưới — phim chỉ phát trong CHRTV PLAY.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {adBlock && (
                  <button onClick={toggleAdBlock} className="col-span-2 py-2.5 bg-amber-500/90 hover:bg-amber-400 text-black text-[13px] font-black rounded-2xl flex items-center justify-center gap-1.5 active:scale-[0.98]">
                    <ShieldOff className="w-4 h-4" /> Tắt Chặn QC & thử lại
                  </button>
                )}
                <button onClick={nextSource} className="col-span-2 py-2.5 grad-brand text-white text-[13px] font-black rounded-2xl flex items-center justify-center gap-1.5 active:scale-[0.98]">
                  <SkipForward className="w-4 h-4" /> Server kế tiếp
                </button>
                <button onClick={reload} className="col-span-2 py-2.5 bg-white/[0.07] hover:bg-white/[0.13] text-white text-[12px] font-bold rounded-2xl flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Tải lại trong app
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Lá chắn click (chống QC) — nuốt click trong giây đầu sau khi nguồn lên */}
        {current && current.kind !== 'hls' && !error && !loading && shieldSec > 0 && adBlock && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center cursor-not-allowed select-none"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShieldSec((v) => (v <= 1 ? 0 : v - 1)); }}
            title="Lá chắn QC: bấm để tắt sớm"
          >
            <span className="pointer-events-none px-3 py-1.5 rounded-full bg-black/80 border border-amber-400/40 text-amber-300 text-[11px] font-black tracking-wide flex items-center gap-1.5 shadow-xl">
              <Shield className="w-3.5 h-3.5" /> Lá chắn QC · {shieldSec}s
            </span>
          </div>
        )}
        {/* (#9/#68) Khay bình luận gắn phút — ghim phút đang phát (nguồn HLS) hoặc phút đã tua */}
        {chatOpen && current && (
          <div className="absolute inset-0 z-40 flex justify-end items-stretch">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={() => setChatOpen(false)} />
            <div className="relative w-full sm:w-[420px] bg-[#0b0c10]/95 border-l border-white/10 overflow-y-auto p-4 anim-slide-left">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[12px] font-black text-white flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-[#ff9a3d]" />Bình luận gắn phút
                  {liveMin !== null && <span className="px-1.5 py-0.5 rounded bg-[#ff9a3d]/20 font-mono text-[10px] text-[#ffb37a]">đang @{fmtTstamp(liveMin)}</span>}
                </p>
                <button onClick={() => setChatOpen(false)} className="p-1 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <CommentsBox target={movieDeepId(movie)} initialTstamp={liveMin} />
            </div>
          </div>
        )}
      </div>

      {/* ===== Server selector ===== */}
      <div className="px-3 md:px-5 py-2.5 bg-[#0c0d12]/95 border-t border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Nguồn phát · {sources.length}</p>
          <button onClick={reload} className="flex items-center gap-1 text-[11px] font-bold text-stone-400 hover:text-white transition">
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {sources.map((s, i) => (
            <button
              key={s.name}
              onClick={() => switchSource(i)}
              className={`pl-2.5 pr-3 py-2 rounded-2xl text-[12px] font-black whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border ${
                i === sourceIdx
                  ? 'grad-brand text-white border-transparent shadow-lg shadow-[#f36f21]/30'
                  : 'bg-white/[0.05] hover:bg-white/[0.11] text-stone-300 hover:text-white border-white/10'
              }`}
            >
              <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] ${i === sourceIdx ? 'bg-white/25 text-white' : 'bg-white/10 text-stone-400'}`}>{i + 1}</span>
              {s.name}
              {s.adFree && (
                <span className={`flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                  i === sourceIdx ? 'bg-white/25 text-white' : 'bg-emerald-500/15 text-emerald-400'
                }`}>
                  <Sparkles className="w-2.5 h-2.5" /> sạch
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Nguồn kind='hls': app tự phát bằng <video> + hls.js, KHÔNG qua iframe bên thứ 3.
 * Đây là kiểu nên dùng cho nguồn có bản quyền (không pop-up, không CSP frame-src,
 * không dính sandbox "Chặn QC").
 */
function HlsPlayer({ src, onLoad, onError, onProgress }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return undefined;
    let hls = null;
    let lastT = -1;
    const report = () => {
      try {
        if (v && Number.isFinite(v.currentTime)) {
          const t = Math.floor(v.currentTime);
          if (t !== lastT) { lastT = t; onProgress?.(t, v.duration && Number.isFinite(v.duration) ? v.duration : 0); }
        }
      } catch {}
    };
    const tick = setInterval(report, 5000);
    const isHls = /\.m3u8($|\?)/i.test(src);
    if (isHls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { onLoad?.(); v.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, d) => { if (d?.fatal) onError?.(); });
    } else {
      // Safari/TV có HLS sẵn, hoặc link mp4 trực tiếp
      v.src = src;
      v.addEventListener('loadeddata', () => onLoad?.(), { once: true });
      v.addEventListener('error', () => onError?.(), { once: true });
      v.play().catch(() => {});
    }
    v.addEventListener('timeupdate', report);
    return () => { clearInterval(tick); try { v.removeEventListener('timeupdate', report); } catch {} try { hls?.destroy(); } catch { /* bỏ qua */ } };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  return <video ref={videoRef} className="absolute inset-0 w-full h-full bg-black" controls playsInline autoPlay />;
}
