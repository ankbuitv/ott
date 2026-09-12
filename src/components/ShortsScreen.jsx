import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Share2, Volume2, VolumeX, Play, Eye, BadgeCheck, Users, Video, X, UserPlus, UserCheck, Edit3, Upload, Link2, Image as ImageIcon, Star, Trophy, Medal, Flame, MessageCircle, Maximize, Minimize, AlertTriangle, RefreshCw } from 'lucide-react';
import Hls from 'hls.js';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../services/config';
import { isHlsUrl } from '../services/streamGuard';
import { authHeaders } from '../services/session';
import { fetchComments } from '../services/social';
import CommentsBox from './CommentsBox';

function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// Chiều cao nhỏ nhất của một thẻ short (video siêu ngang vẫn giữ được khung xem)
const SHORT_MIN_H = 300;

// Đổi tỉ lệ w/h thành nhãn dễ đọc (9:16, 16:9, 1:1...)
function fmtRatio(r) {
  if (!r || !Number.isFinite(r)) return '';
  const known = [[9, 16], [16, 9], [1, 1], [4, 5], [5, 4], [3, 4], [4, 3], [3, 2], [2, 3], [21, 9]];
  for (const [a, b] of known) if (Math.abs(r - a / b) < 0.02) return `${a}:${b}`;
  return `${r.toFixed(2)}:1`;
}

function CreatorAvatar({ creator, author, size = 24, onClick }) {
  const src = creator?.avatar_url;
  const letter = (creator?.display_name || creator?.handle || author || 'C')[0]?.toUpperCase();
  const clickable = !!onClick;
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={`${clickable ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default'} rounded-full overflow-hidden bg-gradient-to-br from-[#f36f21] to-[#e94057] flex items-center justify-center text-white font-black shrink-0`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src ? <img src={src} alt={creator?.handle} className="w-full h-full object-cover" /> : letter}
    </button>
  );
}

// 1 thẻ short — tự theo tỉ lệ thật của video (ngang 16:9 hay dọc 9:16 đều không bị crop)
function ShortPlayer({ short, active, muted, onToggleMute, onSetMuted, onAuthorClick, onFollowToggle, token, maxH = 0 }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [stageW, setStageW] = useState(0);       // chiều rộng khung chứa (đo bằng ResizeObserver)
  const [ratio, setRatio] = useState(0);         // videoWidth / videoHeight — 0 = chưa đo được
  const [showCmt, setShowCmt] = useState(false); // bảng bình luận
  const [cmtCount, setCmtCount] = useState(0);
  // (#shorts-fix) "nhiều short mở không lên": link .m3u8 không phát được bằng thẻ
  // <video> thường trên Chrome/WebView -> cần hls.js; nguồn chặn CORS/http ->
  // retry qua /api/proxy của web. Lỗi thật thì hiện bảng báo + nút thử lại.
  const videoUrl = String(short.video_url || '');
  const isHls = isHlsUrl(videoUrl);
  const hlsSupported = typeof window !== 'undefined' && Hls.isSupported();
  const proxyUrl = videoUrl ? `${API_BASE}/api/proxy?url=${encodeURIComponent(videoUrl)}` : '';
  const [playErr, setPlayErr] = useState(!videoUrl);
  const [loadKey, setLoadKey] = useState(0);     // bump để thử lại sau lỗi
  const srcStageRef = useRef(0);                 // 0 = nguồn gốc, 1 = qua /api/proxy
  const [isFs, setIsFs] = useState(false);       // phóng to toàn màn hình
  const [liked, setLiked] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('chrtv_short_likes') || '[]')).includes(short.id); } catch { return false; }
  });
  const [likes, setLikes] = useState(short.likes || 0);
  const viewedRef = useRef(false);
  const creator = short.creator || null;
  const [localFollow, setLocalFollow] = useState(!!creator?.is_following);
  const [localFollowers, setLocalFollowers] = useState(creator?.followers || 0);

  useEffect(() => { setLocalFollow(!!creator?.is_following); setLocalFollowers(creator?.followers || 0); }, [creator?.is_following, creator?.followers]);

  // Đo chiều rộng khung chứa để tính kích thước video theo đúng tỉ lệ
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setStageW(el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Số bình luận (chỉ tải cho short đang active để đỡ tốn request)
  useEffect(() => {
    if (!active) return;
    let on = true;
    fetchComments(`short-${short.id}`).then((list) => { if (on) setCmtCount(list.length || 0); }).catch(() => {});
    return () => { on = false; };
  }, [active, short.id]);

  // HLS (.m3u8): gắn hls.js cho short đang active (Chrome/WebView không phát
  // native HLS). Manifest lỗi mạng (CORS/mixed-content/nguồn sập) -> đổi sang
  // /api/proxy của web đúng 1 lần; vẫn lỗi mới báo lỗi.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active || !isHls || !hlsSupported || !videoUrl) return;
    let dead = false;
    let hls = null;
    let stage = 0; // 0 = nguồn gốc, 1 = qua /api/proxy
    const attach = (url) => {
      try { if (hls) hls.destroy(); } catch {}
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 20,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
      });
      hls.attachMedia(v);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (!dead) hls.loadSource(url); });
      hls.on(Hls.Events.ERROR, (e, d) => {
        if (dead || !d || !d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && stage === 0 && proxyUrl) {
          stage = 1;
          srcStageRef.current = 1;
          attach(proxyUrl);
          return;
        }
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); } catch {} return; }
        setPlayErr(true);
      });
    };
    attach(videoUrl);
    return () => { dead = true; try { if (hls) hls.destroy(); } catch {} };
  }, [active, videoUrl, isHls, hlsSupported, proxyUrl, loadKey]); // eslint-disable-line

  // Phóng to toàn màn hình 1 short (trả lời "xem nhỏ quá" — mobile/desktop)
  useEffect(() => {
    const onFsChg = () => setIsFs(!!document.fullscreenElement && document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onFsChg);
    return () => document.removeEventListener('fullscreenchange', onFsChg);
  }, []);
  const toggleFs = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (frameRef.current && frameRef.current.requestFullscreen) frameRef.current.requestFullscreen().catch(() => {});
    } catch {}
  };

  // mp4 / HLS-native (Safari-iOS): lỗi nguồn -> thử lại qua /api/proxy 1 lần
  const onVideoTagError = () => {
    if (!active) return;
    if (srcStageRef.current > 0 || !proxyUrl) { setPlayErr(true); return; }
    srcStageRef.current = 1;
    const v = videoRef.current;
    if (!v) return;
    v.src = proxyUrl;
    try { v.load(); } catch {}
    v.play().catch(() => {});
  };

  const retryPlay = () => {
    srcStageRef.current = 0;
    setPlayErr(!videoUrl);
    setPlaying(false);
    const v = videoRef.current;
    if (v && !(isHls && hlsSupported) && videoUrl) {
      v.src = videoUrl;
      try { v.load(); } catch {}
    }
    setLoadKey(k => k + 1);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Mở bảng bình luận thì tạm dừng video, đóng lại thì chạy tiếp
    if (active && !showCmt && !playErr) {
      v.muted = muted; // luôn tôn trọng trạng thái mute hiện tại — KHÔNG tự unmute bao giờ
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      if (!viewedRef.current) {
        viewedRef.current = true;
        fetch(`${API_BASE}/api/shorts/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: short.id, action: 'view' }) }).catch(() => {});
      }
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active, short.id, showCmt, playErr, loadKey]); // eslint-disable-line

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  const onMeta = (e) => {
    const v = e.currentTarget;
    if (v && v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight);
  };

  // Chạm vào video: đang mute thì BẬT TIẾNG (có thao tác người dùng nên trình duyệt cho phép),
  // chạm tiếp theo mới tạm dừng / phát lại. Không bao giờ tự bật tiếng nếu người dùng không chạm.
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (muted && onSetMuted) {
      onSetMuted(false);
      const p = v.paused ? v.play() : Promise.resolve();
      p.then(() => setPlaying(true)).catch(() => { if (onSetMuted) onSetMuted(true); });
      return;
    }
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

  // (#37) Tặng sao creator bằng XP (1 sao = 50 XP)
  const doStar = async () => {
    if (!token) { addToast(t('p48.need_xp').split(' (')[0] || 'Đăng nhập để tặng sao', 'warning'); return; }
    try {
      const r = await fetch(`${API_BASE}/api/shorts/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ short_id: short.id, stars: 1 })
      });
      const d = await r.json();
      if (d.success) addToast(`${d.stars} ⭐ đã tới tay @${creator?.handle} (${d.spent_xp} XP)`, 'success');
      else addToast(d.error || 'Không tặng được', 'error');
    } catch { addToast('Lỗi kết nối', 'error'); }
  };

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (!token) { addToast('Đăng nhập để theo dõi', 'warning'); return; }
    if (!creator?.id) return;
    try {
      const r = await fetch(`${API_BASE}/api/shorts/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creator_id: creator.id })
      });
      const d = await r.json();
      if (d.success) {
        setLocalFollow(!!d.is_following);
        setLocalFollowers(d.followers);
        if (onFollowToggle) onFollowToggle(creator.id, d.is_following, d.followers);
        addToast(d.is_following ? `Đã theo dõi @${creator.handle}` : `Đã bỏ theo dõi @${creator.handle}`, 'success');
      } else addToast(d.error || 'Lỗi', 'error');
    } catch { addToast('Lỗi kết nối', 'error'); }
  };

  // ---- Kích thước khung theo tỉ lệ thật của video ----
  const r = ratio > 0 ? ratio : 9 / 16;                                  // mặc định dọc tới khi biết tỉ lệ
  const limitH = maxH > 0 ? maxH : 720;
  const h = stageW > 0 ? Math.max(SHORT_MIN_H, Math.min(limitH, stageW / r)) : SHORT_MIN_H;
  const w = stageW > 0 ? Math.min(stageW, Math.round(h * r)) : undefined;
  const compact = h < 420;                                               // video ngang → UI gọn lại
  const btn = compact ? 'w-9 h-9' : 'w-11 h-11';
  const btnIcon = compact ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div ref={wrapRef} className="relative w-full flex items-center justify-center" style={isFs ? { height: '100%' } : { height: h }}>
      <div ref={frameRef} className={`relative overflow-hidden bg-black ${isFs ? 'rounded-none' : 'sm:rounded-3xl sm:border sm:border-white/10'}`} style={isFs ? { width: '100%', height: '100%' } : { width: w, height: h }}>
        {/* Nền mờ lấy từ thumbnail — lấp khoảng trống khi video không cùng tỉ lệ khung */}
        {short.thumb_url ? (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `url("${short.thumb_url}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(26px) brightness(.5)', transform: 'scale(1.2)' }}
          />
        ) : null}
        <video
          ref={videoRef}
          src={isHls && hlsSupported ? undefined : (videoUrl || undefined)}
          poster={short.thumb_url || undefined}
          loop
          playsInline
          preload={active ? 'auto' : 'none'}
          onClick={togglePlay}
          onLoadedMetadata={onMeta}
          onError={onVideoTagError}
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 w-full h-full object-contain cursor-pointer"
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 25%, transparent 55%, rgba(0,0,0,.85) 100%)' }}></div>

        {/* Lỗi phát (link chết / nguồn chặn): báo rõ ràng + thử lại thay vì màn hình đen */}
        {playErr && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-[#ff9a3d] mb-3" />
            <p className="text-white font-black text-[14px]">Không phát được video</p>
            <p className="text-white/50 text-[11px] mt-1 mb-4 line-clamp-2">{short.title || short.caption || `Short #${short.id}`}</p>
            <button onClick={retryPlay} className="px-4 py-2 rounded-full bg-[#f36f21] text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110">
              <RefreshCw className="w-3.5 h-3.5" /> Thử lại
            </button>
          </div>
        )}

        {!playing && !playErr && (
          <button onClick={togglePlay} className="absolute inset-0 z-10 flex items-center justify-center" aria-label="Play">
            <span className="w-16 h-16 rounded-full bg-black/50 border-2 border-white/85 flex items-center justify-center anim-pop-fast">
              <Play className="w-7 h-7 text-white fill-current ml-1" />
            </span>
          </button>
        )}

        {/* Nút mute + phóng to toàn màn hình + gợi ý "chạm để bật tiếng" */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
          <button onClick={onToggleMute} title={muted ? t('shorts.unmute') : t('shorts.mute')} className="p-2 rounded-full bg-black/55 text-white/90 hover:bg-black/80">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={toggleFs} title="Phóng to toàn màn hình" className="p-2 rounded-full bg-black/55 text-white/90 hover:bg-black/80">
            {isFs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
        {muted && ratio > 0 && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 border border-white/15 pointer-events-none">
            <VolumeX className="w-3.5 h-3.5 text-white" />
            <span className="text-[10px] font-black text-white/90">{t('shorts.tap_sound')}</span>
          </div>
        )}

        <div className={`absolute right-2.5 ${compact ? 'bottom-14' : 'bottom-24'} z-20 flex flex-col ${compact ? 'gap-2.5' : 'gap-4'} items-center`}>
          <button onClick={doLike} className="flex flex-col items-center gap-1 group">
            <span className={`${btn} rounded-full flex items-center justify-center transition-all active:scale-90 ${liked ? 'bg-[#f3123f]/90 shadow-lg shadow-[#f3123f]/40' : 'bg-black/55 hover:bg-black/80'}`}>
              <Heart className={`${btnIcon} ${liked ? 'text-white fill-current' : 'text-white'}`} />
            </span>
            <span className="text-[10px] font-bold text-white drop-shadow">{fmtCount(likes)}</span>
          </button>
          <button onClick={() => setShowCmt(true)} className="flex flex-col items-center gap-1" title={t('cmt.title')}>
            <span className={`${btn} rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center transition-all active:scale-90`}>
              <MessageCircle className={`${btnIcon} text-white`} />
            </span>
            <span className="text-[10px] font-bold text-white drop-shadow">{fmtCount(cmtCount)}</span>
          </button>
          <button onClick={doShare} className="flex flex-col items-center gap-1">
            <span className={`${btn} rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center transition-all active:scale-90`}>
              <Share2 className={`${btnIcon} text-white`} />
            </span>
            <span className="text-[10px] font-bold text-white drop-shadow">{t('shorts.share')}</span>
          </button>
          {creator?.id && (
            <button onClick={doStar} className="flex flex-col items-center gap-1 group">
              <span className={`${btn} rounded-full bg-black/55 group-hover:bg-[#f5a623]/40 border border-white/10 group-hover:border-amber-400/60 flex items-center justify-center transition-all active:scale-90`}>
                <Star className={`${btnIcon} text-amber-300`} />
              </span>
              <span className="text-[10px] font-bold text-white drop-shadow">⭐ {t('p48.star_short')}</span>
            </button>
          )}
          <span className="flex flex-col items-center gap-1">
            <span className={`${btn} rounded-full bg-black/55 flex items-center justify-center`}>
              <Eye className={`${btnIcon} text-white`} />
            </span>
            <span className="text-[10px] font-bold text-white drop-shadow">{fmtCount(short.views)}</span>
          </span>
        </div>

        <div className={`absolute left-0 right-16 bottom-0 z-20 ${compact ? 'p-3' : 'p-4'}`}>
          {creator ? (
            <div className={`flex items-center gap-2.5 ${compact ? 'mb-1.5' : 'mb-2'}`}>
              <CreatorAvatar creator={creator} size={compact ? 28 : 34} onClick={() => onAuthorClick && onAuthorClick(creator)} />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onAuthorClick && onAuthorClick(creator)}>
                <div className="flex items-center gap-1">
                  <span className="text-[13px] font-black text-white leading-tight truncate">{creator.display_name}</span>
                  {creator.verified && <BadgeCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <span className="truncate">@{creator.handle}</span>
                  <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{fmtCount(localFollowers)}</span>
                </div>
              </div>
              <button onClick={handleFollow} className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all active:scale-95 ${localFollow ? 'bg-white/20 text-white border border-white/30' : 'bg-white text-black hover:bg-white/90'}`}>
                {localFollow ? <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" />Đang theo dõi</span> : <span className="flex items-center gap-1"><UserPlus className="w-3 h-3" />Theo dõi</span>}
              </button>
            </div>
          ) : short.author ? (
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-white mb-1.5 cursor-pointer" onClick={() => onAuthorClick && onAuthorClick({ handle: short.author })}>
              <span className="w-6 h-6 rounded-full grad-brand flex items-center justify-center text-[10px] font-black">
                {(short.author || 'C')[0].toUpperCase()}
              </span>
              {short.author}
              <BadgeCheck className="w-3.5 h-3.5 text-cyan-400" />
            </p>
          ) : null}
          {short.title && <p className={`${compact ? 'text-[13px] line-clamp-1' : 'text-[14px] line-clamp-2'} font-extrabold text-white leading-snug drop-shadow`}>{short.title}</p>}
          {short.caption && <p className={`text-[12px] text-white/75 mt-0.5 leading-snug ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{short.caption}</p>}
          {!compact && creator?.bio && <p className="text-[11px] text-white/60 mt-1.5 line-clamp-1 italic">{creator.bio}</p>}
          {ratio > 0 && (
            <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-white/45">{fmtRatio(ratio)} · {t('shorts.fit_video')}</p>
          )}
        </div>
      </div>

      {showCmt && (
        <ShortCommentsSheet
          short={short}
          onClose={() => setShowCmt(false)}
          onCount={setCmtCount}
        />
      )}
    </div>
  );
}

// Bình luận của 1 short — bảng trượt từ dưới lên (kiểu TikTok/YouTube Shorts)
function ShortCommentsSheet({ short, onClose, onCount }) {
  const { t } = useI18n();
  const who = short.title || (short.creator?.handle ? `@${short.creator.handle}` : short.author || '');
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-[520px] max-h-[72vh] flex flex-col rounded-t-[24px] border-t border-white/10 bg-[#151515] shadow-2xl anim-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
          <span className="w-1 h-4 rounded-full bg-[#f36f21]" />
          <MessageCircle className="w-4 h-4 text-slate-400 shrink-0" />
          <p className="text-[13px] font-black text-white truncate flex-1">
            {t('cmt.title')}{who ? <span className="text-stone-500 font-bold"> · {who}</span> : null}
          </p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <CommentsBox target={`short-${short.id}`} variant="short" onCount={onCount} />
        </div>
      </div>
    </div>
  );
}

function CreatorProfileModal({ identifier, onClose, onSelectShort, myProfile, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followState, setFollowState] = useState({ is_following: false, followers: 0 });
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (identifier?.id) params.set('creator_id', identifier.id);
    else if (identifier?.handle) params.set('handle', identifier.handle);
    else if (typeof identifier === 'string') params.set('handle', identifier);
    fetch(`${API_BASE}/api/shorts/creator?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d.success) {
          setData(d);
          setFollowState({ is_following: !!d.creator.is_following, followers: d.creator.followers || 0 });
        }
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [identifier]);

  const toggleFollow = async () => {
    if (!token) { addToast('Đăng nhập để theo dõi', 'warning'); return; }
    const cid = data?.creator?.id;
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/shorts/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creator_id: cid })
      });
      const j = await r.json();
      if (j.success) {
        setFollowState({ is_following: !!j.is_following, followers: j.followers });
        addToast(j.is_following ? 'Đã theo dõi' : 'Đã bỏ theo dõi', 'success');
      } else addToast(j.error || 'Lỗi', 'error');
    } catch { addToast('Lỗi kết nối', 'error'); }
  };

  const isOwn = myProfile && data?.creator?.id && myProfile.id === data.creator.id;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[520px] max-h-[92vh] sm:max-h-[88vh] bg-[#151515] sm:rounded-3xl rounded-t-[28px] border border-white/10 overflow-hidden flex flex-col shadow-2xl">
        <div className="relative shrink-0">
          <div className="h-28 bg-gradient-to-br from-[#f36f21] via-[#e94057] to-[#8b5cf6]"></div>
          <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"><X className="w-4 h-4" /></button>
          <div className="absolute -bottom-12 left-5 flex items-end gap-4">
            <div className="w-20 h-20 rounded-3xl overflow-hidden border-[3px] border-[#151515] bg-[#222] flex items-center justify-center text-xl font-black text-white">
              {data?.creator?.avatar_url ? <img src={data.creator.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : (data?.creator?.display_name || data?.creator?.handle || 'C')[0]?.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="pt-14 px-5 pb-3 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-10 text-center">
              <div className="w-8 h-8 mx-auto border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <p className="text-xs text-white/50 mt-3">Đang tải hồ sơ...</p>
            </div>
          ) : !data?.creator ? (
            <div className="py-10 text-center">
              <p className="text-white font-bold">Không tìm thấy người đăng</p>
              <p className="text-xs text-white/50 mt-1">@{identifier?.handle || ''}</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[18px] font-black text-white leading-tight truncate">{data.creator.display_name}</h3>
                    {data.creator.verified ? <BadgeCheck className="w-4 h-4 text-cyan-400" /> : null}
                  </div>
                  <p className="text-[13px] text-white/60">@{data.creator.handle}</p>
                  <div className="flex items-center gap-3 mt-2 text-[12px]">
                    <span className="flex items-center gap-1 text-white/80"><Users className="w-3.5 h-3.5" /><b className="text-white">{fmtCount(followState.followers)}</b> người theo dõi</span>
                    <span className="flex items-center gap-1 text-white/80"><Video className="w-3.5 h-3.5" /><b className="text-white">{data.creator.shorts_count || (data.shorts?.length || 0)}</b> video</span>
                  </div>
                </div>
                {!isOwn && (
                  <button onClick={toggleFollow} className={`shrink-0 px-4 py-2 rounded-full text-[12px] font-black transition-all active:scale-95 ${followState.is_following ? 'bg-white/15 text-white border border-white/20' : 'bg-white text-black hover:bg-white/90'}`}>
                    {followState.is_following ? 'Đang theo dõi' : 'Theo dõi'}
                  </button>
                )}
                {isOwn && (
                  <span className="shrink-0 px-3 py-1.5 rounded-full bg-[#f36f21]/20 text-[#f36f21] text-[11px] font-black border border-[#f36f21]/30">Kênh của bạn</span>
                )}
              </div>
              {data.creator.bio && (
                <div className="mt-4 p-3 rounded-2xl bg-white/[0.06] border border-white/10">
                  <p className="text-[12px] text-white/80 leading-relaxed whitespace-pre-wrap">{data.creator.bio}</p>
                </div>
              )}

              <div className="mt-6">
                <h4 className="text-[13px] font-black text-white mb-3 flex items-center gap-2"><Video className="w-4 h-4 text-[#f36f21]" /> Video của {data.creator.display_name}</h4>
                {(!data.shorts || data.shorts.length === 0) ? (
                  <p className="text-[12px] text-white/40 py-6 text-center">Chưa có video nào</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {data.shorts.map(v => (
                      <button key={v.id} onClick={() => { if (onSelectShort) onSelectShort(v.id); onClose(); }} className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-black border border-white/10 hover:border-white/20 transition-all text-left">
                        {v.thumb_url ? <img src={v.thumb_url} alt={v.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" /> : <div className="w-full h-full bg-[#222] flex items-center justify-center text-white/30"><Video className="w-6 h-6" /></div>}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                        <div className="absolute bottom-1 left-1 right-1">
                          <p className="text-[10px] font-bold text-white line-clamp-2 leading-tight">{v.title || 'Video'}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] text-white/70">
                            <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{fmtCount(v.views)}</span>
                            <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{fmtCount(v.likes)}</span>
                          </div>
                        </div>
                        <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-3 h-3 text-white fill-current ml-0.5" /></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 p-3 border-t border-white/10 bg-[#111] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full bg-white/10 text-white text-[13px] font-bold hover:bg-white/15">Đóng</button>
        </div>
      </div>
    </div>
  );
}

function CreateProfileModal({ onClose, onCreated, token }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ handle: '', display_name: '', avatar_url: '', bio: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.handle || form.handle.length < 3) { addToast('Handle cần ≥3 ký tự', 'warning'); return; }
    if (!form.display_name) { addToast('Thiếu tên hiển thị', 'warning'); return; }
    setBusy(true);
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${API_BASE}/api/shorts/creator/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form)
        });
        const raw = await r.text();
        let d = {};
        try { d = raw ? JSON.parse(raw) : {}; } catch { d = { error: raw.slice(0, 160) || `HTTP ${r.status}` }; }
        if (d.success) {
          addToast('Đã tạo hồ sơ creator', 'success');
          if (onCreated) onCreated(d.profile);
          onClose();
          setBusy(false);
          return;
        }
        lastErr = d.error || d.message || `HTTP ${r.status}`;
        if (r.status >= 500 && attempt === 0) { await new Promise((ok) => setTimeout(ok, 450)); continue; }
        break;
      } catch (e) {
        lastErr = e?.message || 'Lỗi kết nối';
        if (attempt === 0) { await new Promise((ok) => setTimeout(ok, 450)); continue; }
      }
    }
    addToast(lastErr || 'Không tạo được hồ sơ', 'error');
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-[#1a1a1a] rounded-[24px] border border-white/10 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-black text-white">Tạo hồ sơ người đăng</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Handle (@tên không dấu)</label>
            <input value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })} placeholder="vd: chillguy" className="mt-1 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px] focus:outline-none focus:border-[#f36f21]" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Tên hiển thị</label>
            <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Tên kênh của bạn" className="mt-1 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Avatar URL</label>
            <input value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://.../avatar.jpg" className="mt-1 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Mô tả / Bio</label>
            <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Mô tả kênh, sở thích, nội dung bạn đăng..." rows={3} className="mt-1 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px] resize-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-full bg-white/10 text-white text-[13px] font-bold">Hủy</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-3 rounded-full bg-white text-black text-[13px] font-black hover:bg-white/90 disabled:opacity-50">{busy ? 'Đang tạo...' : 'Tạo hồ sơ'}</button>
        </div>
      </div>
    </div>
  );
}

function UploadShortModal({ onClose, onUploaded, token }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ title: '', caption: '', video_url: '', thumb_url: '', duration: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.video_url) { addToast('Thiếu link video', 'warning'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/shorts/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const d = await r.json();
      if (d.success) { addToast('Đã đăng video', 'success'); if (onUploaded) onUploaded(); onClose(); }
      else addToast(d.error || 'Lỗi', 'error');
    } catch { addToast('Lỗi kết nối', 'error'); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-[#1a1a1a] rounded-[24px] border border-white/10 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-black text-white flex items-center gap-2"><Upload className="w-4 h-4" /> Đăng Short mới</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Tiêu đề" className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
          <input value={form.caption} onChange={e => setForm({ ...form, caption: e.target.value })} placeholder="Caption / mô tả ngắn" className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-white/40 shrink-0" />
            <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="Video URL (mp4, m3u8, ...)" className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
          </div>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-white/40 shrink-0" />
            <input value={form.thumb_url} onChange={e => setForm({ ...form, thumb_url: e.target.value })} placeholder="Thumbnail URL (tùy chọn)" className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
          </div>
          <input value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="Thời lượng (giây, vd 15)" type="number" className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-[13px]" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-full bg-white/10 text-white text-[13px] font-bold">Hủy</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-3 rounded-full bg-[#f36f21] text-white text-[13px] font-black hover:bg-[#f36f21]/90 disabled:opacity-50">{busy ? 'Đang đăng...' : 'Đăng video'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ShortsScreen({ startId = null, onStartHandled = null } = {}) {
  const { t } = useI18n();
  const { isAuthenticated, token, user } = useAuth();
  const [shorts, setShorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const [creators, setCreators] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [challenges, setChallenges] = useState([]);
  const [showChal, setShowChal] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [chalFocus, setChalFocus] = useState(null);
  const [stageH, setStageH] = useState(0);   // chiều cao khung chứa feed (để chặn chiều cao video)
  const listRef = useRef(null);

  const fetchShorts = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API_BASE}/api/shorts?limit=40`, { headers });
      const d = await r.json();
      setShorts(d.shorts || []);
    } catch {}
    setLoading(false);
  }, [token]);

  const fetchCreators = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API_BASE}/api/shorts/creators`, { headers });
      const d = await r.json();
      setCreators(d.creators || []);
    } catch {}
  }, [token]);

  const fetchMyProfile = useCallback(async () => {
    if (!token) { setMyProfile(null); return; }
    try {
      const r = await fetch(`${API_BASE}/api/shorts/creator/profile`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setMyProfile(d.profile);
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchShorts();
    fetchCreators();
    fetchMyProfile();
    fetch(`${API_BASE}/api/challenges`).then(r => r.json()).then(d => setChallenges(d.challenges || [])).catch(() => {});
  }, [fetchShorts, fetchCreators, fetchMyProfile]);

  // Đo chiều cao khung feed → truyền xuống từng short để chặn chiều cao tối đa
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const read = () => setStageH(el.clientHeight || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shorts.length === 0]); // eslint-disable-line

  // Video đang active = video lấp nhiều khung nhìn nhất (chiều cao thẻ giờ thay đổi theo tỉ lệ video)
  const ratioMap = useRef(new Map());
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll('[data-short-index]'));
    if (nodes.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const idx = Number(en.target.getAttribute('data-short-index'));
        if (!Number.isFinite(idx)) return;
        ratioMap.current.set(idx, en.isIntersecting ? en.intersectionRatio : 0);
      });
      let best = -1, bestR = 0;
      ratioMap.current.forEach((r, idx) => { if (r > bestR) { bestR = r; best = idx; } });
      if (best >= 0 && bestR > 0.2) setActiveIdx(best);
    }, { root: el, threshold: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95] });
    nodes.forEach(n => io.observe(n));
    return () => io.disconnect();
  }, [shorts.length, loading]);

  // Cuộn tới đúng thẻ (offset tương đối trong wrapper nên không phụ thuộc chiều cao từng video)
  const scrollToIndex = useCallback((idx) => {
    const el = listRef.current;
    if (!el) return;
    const inner = el.firstElementChild;
    const node = inner && inner.children[idx];
    if (!node) return;
    try {
      el.scrollTo({ top: Math.max(0, node.offsetTop - inner.offsetTop), behavior: 'smooth' });
    } catch {
      el.scrollTop = Math.max(0, node.offsetTop - inner.offsetTop);
    }
    setActiveIdx(idx);
  }, []);

  useEffect(() => {
    if (!startId || shorts.length === 0) return;
    const idx = shorts.findIndex(s => String(s.id) === String(startId));
    if (idx > 0) scrollToIndex(idx);
    if (onStartHandled) onStartHandled();
  }, [startId, shorts, scrollToIndex, onStartHandled]); // eslint-disable-line

  const handleFollowToggle = (creatorId, isFollowing, followers) => {
    setShorts(prev => prev.map(s => {
      if (s.creator && s.creator.id === creatorId) {
        return { ...s, creator: { ...s.creator, is_following: isFollowing, followers } };
      }
      return s;
    }));
    setCreators(prev => prev.map(c => c.id === creatorId ? { ...c, is_following: isFollowing, followers } : c));
  };

  const playChallengeShort = async (sh) => {
    // đưa short của challenge lên đầu feed và chạy luôn (kể cả short không có trong feed hiện tại).
    // Ưu tiên object đầy đủ từ /api/shorts (creator kèm id/followers/…) — nếu không có thì tự
    // ghép creator từ danh sách creators đã nạp để các nút follow/tặng sao vẫn hoạt động.
    let item = shorts.find(x => String(x.id) === String(sh.id));
    if (!item) {
      try {
        const d = await (await fetch(`${API_BASE}/api/shorts?limit=60`)).json();
        item = (d.shorts || []).find(x => String(x.id) === String(sh.id)) || null;
      } catch { item = null; }
    }
    if (!item) {
      const handle = sh.creator?.handle || sh.creator_handle || '';
      const c = creators.find(x => x.handle === handle) || null;
      item = c ? { ...sh, creator: c } : { ...sh, creator: sh.creator ? { ...sh.creator, display_name: sh.creator.display_name || sh.creator.handle, bio: '' } : null };
    }
    setShorts(prev => prev.some(x => String(x.id) === String(item.id)) ? prev : [item, ...prev]);
    setActiveIdx(0);
    requestAnimationFrame(() => scrollToIndex(0));
    setShowChal(false);
  };

  const handleSelectShort = (id) => {
    const idx = shorts.findIndex(s => String(s.id) === String(id));
    if (idx >= 0) requestAnimationFrame(() => scrollToIndex(idx));
  };

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

  return (
    <div className="pb-8">
      <div className="px-5 md:px-8 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">{t('shorts.title')}</h2>
          <p className="text-[11px] text-stone-500 mt-0.5">{t('shorts.sub')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-stone-500">{activeIdx + 1} / {shorts.length}</span>
          {isAuthenticated && myProfile && (
            <button onClick={() => setShowUpload(true)} className="p-2 rounded-full bg-white text-black hover:bg-white/90"><Upload className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {/* (#40) Challenge hashtag tuần + (#38) BXH sao tuần */}
      {challenges.length > 0 && (
        <div className="px-5 md:px-8 mb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-[#f36f21]" />{t('p48.challenge')}</span>
            {challenges.slice(0, 6).map(c => (
              <button key={c.id} onClick={() => { setChalFocus(c.id); setShowChal(true); }} className="shrink-0 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#f36f21]/15 to-[#e94057]/10 border border-[#f36f21]/30 text-[11px] font-black text-[#ffb37a] hover:bg-[#f36f21]/25 transition active:scale-95">
                #{c.hashtag} {String(c.ends_at || '').slice(0, 10) >= new Date().toISOString().slice(0, 10) || !c.ends_at ? '🔥' : ''}
              </button>
            ))}
            <button onClick={() => setShowBoard(true)} className="shrink-0 ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-[11px] font-black text-amber-300 hover:bg-amber-400/20 transition active:scale-95">
              <Trophy className="w-3.5 h-3.5" />{t('p48.leaderboard')}
            </button>
          </div>
        </div>
      )}
      {challenges.length === 0 && (
        <div className="px-5 md:px-8 mb-3 flex justify-end">
          <button onClick={() => setShowBoard(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-[11px] font-black text-amber-300 hover:bg-amber-400/20 transition active:scale-95">
            <Trophy className="w-3.5 h-3.5" />{t('p48.leaderboard')}
          </button>
        </div>
      )}

      {/* Creator bar */}
      <div className="px-5 md:px-8 mb-3">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1">
          {isAuthenticated && (
            myProfile ? (
              <button onClick={() => setSelectedCreator({ id: myProfile.id, handle: myProfile.handle })} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-[52px] h-[52px] rounded-full p-[2px] bg-gradient-to-br from-[#f36f21] to-[#e94057]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-[#222] flex items-center justify-center">
                    {myProfile.avatar_url ? <img src={myProfile.avatar_url} alt="me" className="w-full h-full object-cover" /> : (myProfile.display_name[0] || 'M').toUpperCase()}
                  </div>
                </div>
                <span className="text-[10px] font-bold text-white max-w-[60px] truncate">Bạn</span>
              </button>
            ) : (
              <button onClick={() => setShowCreate(true)} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-[52px] h-[52px] rounded-full bg-white/10 border border-dashed border-white/20 flex items-center justify-center text-white/60"><UserPlus className="w-5 h-5" /></div>
                <span className="text-[10px] font-bold text-white/60 max-w-[60px] truncate">Tạo kênh</span>
              </button>
            )
          )}
          {creators.map(c => (
            <button key={c.id} onClick={() => setSelectedCreator({ id: c.id, handle: c.handle })} className="flex flex-col items-center gap-1.5 shrink-0 group">
              <div className="w-[52px] h-[52px] rounded-full p-[2px] bg-white/10 group-hover:bg-gradient-to-br group-hover:from-[#f36f21] group-hover:to-[#e94057] transition-all">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#222] flex items-center justify-center text-[12px] font-black text-white">
                  {c.avatar_url ? <img src={c.avatar_url} alt={c.handle} className="w-full h-full object-cover" /> : (c.display_name || c.handle)[0]?.toUpperCase()}
                </div>
              </div>
              <span className="text-[10px] font-bold text-white/80 max-w-[60px] truncate flex items-center gap-0.5">@{c.handle}{c.verified ? <BadgeCheck className="w-3 h-3 text-cyan-400" /> : null}</span>
            </button>
          ))}
        </div>
      </div>

      {shorts.length === 0 ? (
        <div className="px-5 py-20 text-center">
          <p className="text-5xl mb-4">🎬</p>
          <h2 className="text-lg font-black text-white">{t('shorts.title')}</h2>
          <p className="text-[13px] text-stone-500 mt-2">{t('shorts.empty')}</p>
          {isAuthenticated && !myProfile && (
            <button onClick={() => setShowCreate(true)} className="mt-4 px-5 py-2.5 rounded-full bg-white text-black font-black text-[13px]">Tạo hồ sơ để đăng video</button>
          )}
        </div>
      ) : (
        <div
          ref={listRef}
          className="mx-auto px-3 sm:px-0 overflow-y-auto"
          style={{ maxWidth: 'min(94vw, 560px)', height: 'calc(100dvh - 265px)', minHeight: 460, scrollSnapType: 'y proximity', scrollbarWidth: 'none', overscrollBehavior: 'contain' }}
        >
          <div className="space-y-3 pb-2">
            {shorts.map((s, i) => (
              <div key={s.id} data-short-index={i} style={{ scrollSnapAlign: 'center' }}>
                <ShortPlayer
                  short={s}
                  active={i === activeIdx}
                  muted={muted}
                  onToggleMute={() => setMuted(m => !m)}
                  onSetMuted={(next) => setMuted(!!next)}
                  maxH={stageH}
                  onAuthorClick={setSelectedCreator}
                  onFollowToggle={handleFollowToggle}
                  token={token}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCreator && (
        <CreatorProfileModal identifier={selectedCreator} onClose={() => setSelectedCreator(null)} onSelectShort={handleSelectShort} myProfile={myProfile} token={token} />
      )}
      {showCreate && (
        <CreateProfileModal onClose={() => setShowCreate(false)} token={token} onCreated={(p) => { setMyProfile(p); fetchCreators(); fetchShorts(); }} />
      )}
      {showUpload && (
        <UploadShortModal onClose={() => setShowUpload(false)} token={token} onUploaded={() => { fetchShorts(); fetchCreators(); }} />
      )}
      {showChal && <ChallengesModal challenges={challenges} focusId={chalFocus} onClose={() => setShowChal(false)} onPick={playChallengeShort} />}
      {showBoard && <WeeklyBoardModal onClose={() => setShowBoard(false)} token={token} />}
    </div>
  );
}

// (#40) Tổng hợp thử thách hashtag — mở từng challenge xem short tham gia
function ChallengesModal({ challenges, focusId = null, onClose, onPick }) {
  const { t } = useI18n();
  const [active, setActive] = useState(() => challenges.find(c => String(c.id) === String(focusId)) || challenges[0] || null);
  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl modal-panel overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Flame className="w-4 h-4 text-[#f36f21]" />{t('p48.challenge_week')}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex gap-1.5 px-4 pt-3 overflow-x-auto scrollbar-none">
          {challenges.map(c => (
            <button key={c.id} onClick={() => setActive(c)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black border transition ${active?.id === c.id ? 'grad-brand text-white border-transparent' : 'bg-white/[0.05] border-white/10 text-stone-400'}`}>#{c.hashtag}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {active ? (
            <>
              <h3 className="text-[16px] font-black text-white">{active.title}</h3>
              <p className="text-[11px] text-stone-400 mt-1 line-clamp-3">{active.description || 'Chưa có mô tả'}</p>
              <div className="flex gap-2 text-[10px] text-stone-500 mt-1.5">
                {active.starts_at ? <span>Bắt đầu: {String(active.starts_at).slice(0, 10)}</span> : null}
                {active.ends_at ? <span>· Kết thúc: {String(active.ends_at).slice(0, 10)}</span> : <span>· Diễn ra thường xuyên</span>}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mt-4">
                {(active.shorts || []).map(sh => (
                  <button key={sh.id} onClick={() => onPick(sh)} className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-stone-900 border border-white/10 hover:border-[#f36f21]/60 active:scale-[0.98] transition">
                    {sh.thumb_url ? <img src={sh.thumb_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} /> : <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-6">
                      <p className="text-[10px] font-bold text-white truncate">{(sh.title || sh.caption || '').slice(0, 50)}</p>
                      <p className="text-[9px] text-stone-400 flex items-center gap-1"><Eye className="w-2.5 h-2.5" />{(sh.views || 0)} · @{sh.creator?.handle || sh.creator_handle || 'creator'}</p>
                    </div>
                  </button>
                ))}
                {(active.shorts || []).length === 0 && <p className="col-span-full text-[11px] text-stone-600 italic text-center py-10">Chưa có video nào dùng #{active.hashtag} — hãy là người đầu tiên!</p>}
              </div>
            </>
          ) : <p className="text-[11px] text-stone-600 italic py-10 text-center">Chưa có thử thách nào đang chạy</p>}
        </div>
      </div>
    </div>
  );
}

// (#38) BXH sao tuần creator
function WeeklyBoardModal({ onClose, token }) {
  const { t } = useI18n();
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE}/api/shorts/creator/weekly`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => { setBoard(d.board || []); setLoading(false); }).catch(() => setLoading(false));
  }, [token]);
  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm modal-panel overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-300" />{t('p48.leaderboard')}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {loading && <p className="text-[11px] text-stone-500 text-center py-6">Đang tính…</p>}
          {!loading && board.length === 0 && <p className="text-[11px] text-stone-600 italic text-center py-6">Chưa ai nhận sao tuần này — tặng ⭐ cho creator bạn thích nhé!</p>}
          {board.map((b, i) => (
            <div key={b.creator_id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${i < 3 ? 'border-amber-400/30 bg-amber-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <span className="w-6 text-center text-[13px] font-black">{i === 0 ? <Medal className="w-4 h-4 text-amber-300" /> : i === 1 ? <Medal className="w-4 h-4 text-slate-300" /> : i === 2 ? <Medal className="w-4 h-4 text-orange-400/80" /> : i + 1}</span>
              <span className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-[11px] font-black shrink-0">
                {b.avatar_url ? <img src={b.avatar_url} alt="" className="w-full h-full object-cover" /> : '@'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-white truncate">{b.display_name || b.handle}</p>
                <p className="text-[9px] text-stone-500">@{b.handle}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-black text-amber-300">⭐ {b.stars}</p>
                <p className="text-[9px] text-stone-500">{b.fans} fan</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
