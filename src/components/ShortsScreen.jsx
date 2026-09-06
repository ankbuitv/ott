import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Share2, Volume2, VolumeX, Play, Eye, BadgeCheck } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE } from '../services/config';

function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// 1 thẻ short dọc — tự phát khi lọt vào khung nhìn
function ShortPlayer({ short, active, muted, onToggleMute }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('chrtv_short_likes') || '[]')).includes(short.id); } catch { return false; }
  });
  const [likes, setLikes] = useState(short.likes || 0);
  const viewedRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.muted = muted;
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      if (!viewedRef.current) {
        viewedRef.current = true;
        fetch(`${API_BASE}/api/shorts/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: short.id, action: 'view' }) }).catch(() => {});
      }
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active, short.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const doLike = () => {
    const next = !liked;
    setLiked(next);
    setLikes(c => c + (next ? 1 : -1));
    try {
      const arr = JSON.parse(localStorage.getItem('chrtv_short_likes') || '[]');
      localStorage.setItem('chrtv_short_likes', JSON.stringify(next ? [...arr, short.id] : arr.filter(x => x !== short.id)));
    } catch {}
    if (next) fetch(`${API_BASE}/api/shorts/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: short.id, action: 'like' }) }).catch(() => {});
  };

  const doShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#short-${short.id}`;
    const text = short.title || 'CHRTV PLAY Shorts';
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(url); addToast(t('shorts.copied'), 'success'); }
    } catch {}
  };

  return (
    <div className="relative h-full w-full bg-black overflow-hidden sm:rounded-3xl sm:border sm:border-white/10" style={{ scrollSnapAlign: 'center' }}>
      <video
        ref={videoRef}
        src={short.video_url}
        poster={short.thumb_url || undefined}
        loop
        playsInline
        preload="metadata"
        onClick={togglePlay}
        className="absolute inset-0 w-full h-full object-cover cursor-pointer"
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 25%, transparent 55%, rgba(0,0,0,.8) 100%)' }}></div>

      {!playing && (
        <button onClick={togglePlay} className="absolute inset-0 z-10 flex items-center justify-center" aria-label="Play">
          <span className="w-16 h-16 rounded-full bg-black/50 border-2 border-white/85 flex items-center justify-center anim-pop-fast">
            <Play className="w-7 h-7 text-white fill-current ml-1" />
          </span>
        </button>
      )}

      {/* Nút tiếng */}
      <button onClick={onToggleMute} className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/55 text-white/90 hover:bg-black/80" title={muted ? t('shorts.unmute') : t('shorts.mute')}>
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      {/* Cột nút bên phải */}
      <div className="absolute right-2.5 bottom-24 z-20 flex flex-col gap-4 items-center">
        <button onClick={doLike} className="flex flex-col items-center gap-1 group">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${liked ? 'bg-[#f3123f]/90 shadow-lg shadow-[#f3123f]/40' : 'bg-black/55 hover:bg-black/80'}`}>
            <Heart className={`w-5 h-5 ${liked ? 'text-white fill-current' : 'text-white'}`} />
          </span>
          <span className="text-[10px] font-bold text-white drop-shadow">{fmtCount(likes)}</span>
        </button>
        <button onClick={doShare} className="flex flex-col items-center gap-1">
          <span className="w-11 h-11 rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center transition-all active:scale-90">
            <Share2 className="w-5 h-5 text-white" />
          </span>
          <span className="text-[10px] font-bold text-white drop-shadow">{t('shorts.share')}</span>
        </button>
        <span className="flex flex-col items-center gap-1">
          <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center">
            <Eye className="w-5 h-5 text-white" />
          </span>
          <span className="text-[10px] font-bold text-white drop-shadow">{fmtCount(short.views)}</span>
        </span>
      </div>

      {/* Chú thích */}
      <div className="absolute left-0 right-16 bottom-0 z-20 p-4">
        {short.author && (
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-white mb-1.5">
            <span className="w-6 h-6 rounded-full grad-brand flex items-center justify-center text-[10px] font-black">
              {(short.author || 'C')[0].toUpperCase()}
            </span>
            {short.author}
            <BadgeCheck className="w-3.5 h-3.5 text-cyan-400" />
          </p>
        )}
        {short.title && <p className="text-[14px] font-extrabold text-white leading-snug drop-shadow line-clamp-2">{short.title}</p>}
        {short.caption && <p className="text-[12px] text-white/75 mt-1 leading-snug line-clamp-2">{short.caption}</p>}
      </div>
    </div>
  );
}

export default function ShortsScreen() {
  const { t } = useI18n();
  const [shorts, setShorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/shorts?limit=30`)
      .then(r => r.json())
      .then(d => { if (alive) { setShorts(d.shorts || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIdx(Math.max(0, Math.min(idx, shorts.length - 1)));
  }, [shorts.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-stone-500 mt-3">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (shorts.length === 0) {
    return (
      <div className="px-5 py-20 text-center">
        <p className="text-5xl mb-4">🎬</p>
        <h2 className="text-lg font-black text-white">{t('shorts.title')}</h2>
        <p className="text-[13px] text-stone-500 mt-2">{t('shorts.empty')}</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="px-5 md:px-8 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">{t('shorts.title')}</h2>
          <p className="text-[11px] text-stone-500 mt-0.5">{t('shorts.sub')}</p>
        </div>
        <span className="text-[11px] font-mono text-stone-500">{activeIdx + 1} / {shorts.length}</span>
      </div>
      <div
        ref={listRef}
        onScroll={onScroll}
        className="mx-auto px-3 sm:px-0 overflow-y-auto"
        style={{ maxWidth: 420, height: 'calc(100vh - 215px)', minHeight: 420, scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
      >
        <div className="space-y-3 pb-2">
          {shorts.map((s, i) => (
            <div key={s.id} style={{ height: 'calc(100vh - 225px)', minHeight: 410 }}>
              <ShortPlayer short={s} active={i === activeIdx} muted={muted} onToggleMute={() => setMuted(m => !m)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
