import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Share2, Volume2, VolumeX, Play, Eye, BadgeCheck, Users, Video, X, UserPlus, UserCheck, Edit3, Upload, Link2, Image as ImageIcon } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../services/config';

function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
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

// 1 thẻ short dọc
function ShortPlayer({ short, active, muted, onToggleMute, onAuthorClick, onFollowToggle, token }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('chrtv_short_likes') || '[]')).includes(short.id); } catch { return false; }
  });
  const [likes, setLikes] = useState(short.likes || 0);
  const viewedRef = useRef(false);
  const creator = short.creator || null;
  const [localFollow, setLocalFollow] = useState(!!creator?.is_following);
  const [localFollowers, setLocalFollowers] = useState(creator?.followers || 0);

  useEffect(() => { setLocalFollow(!!creator?.is_following); setLocalFollowers(creator?.followers || 0); }, [creator?.is_following, creator?.followers]);

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
  }, [active, short.id]); // eslint-disable-line

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
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 25%, transparent 55%, rgba(0,0,0,.85) 100%)' }}></div>

      {!playing && (
        <button onClick={togglePlay} className="absolute inset-0 z-10 flex items-center justify-center" aria-label="Play">
          <span className="w-16 h-16 rounded-full bg-black/50 border-2 border-white/85 flex items-center justify-center anim-pop-fast">
            <Play className="w-7 h-7 text-white fill-current ml-1" />
          </span>
        </button>
      )}

      <button onClick={onToggleMute} className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/55 text-white/90 hover:bg-black/80">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

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

      <div className="absolute left-0 right-16 bottom-0 z-20 p-4">
        {creator ? (
          <div className="flex items-center gap-2.5 mb-2">
            <CreatorAvatar creator={creator} size={34} onClick={() => onAuthorClick && onAuthorClick(creator)} />
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
        {short.title && <p className="text-[14px] font-extrabold text-white leading-snug drop-shadow line-clamp-2">{short.title}</p>}
        {short.caption && <p className="text-[12px] text-white/75 mt-1 leading-snug line-clamp-2">{short.caption}</p>}
        {creator?.bio && <p className="text-[11px] text-white/60 mt-1.5 line-clamp-1 italic">{creator.bio}</p>}
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
  }, [fetchShorts, fetchCreators, fetchMyProfile]);

  useEffect(() => {
    if (!startId || shorts.length === 0) return;
    const idx = shorts.findIndex(s => String(s.id) === String(startId));
    if (idx > 0 && listRef.current) {
      try {
        listRef.current.scrollTop = idx * listRef.current.clientHeight;
        setActiveIdx(idx);
      } catch {}
    }
    if (onStartHandled) onStartHandled();
  }, [startId, shorts]); // eslint-disable-line

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIdx(Math.max(0, Math.min(idx, shorts.length - 1)));
  }, [shorts.length]);

  const handleFollowToggle = (creatorId, isFollowing, followers) => {
    setShorts(prev => prev.map(s => {
      if (s.creator && s.creator.id === creatorId) {
        return { ...s, creator: { ...s.creator, is_following: isFollowing, followers } };
      }
      return s;
    }));
    setCreators(prev => prev.map(c => c.id === creatorId ? { ...c, is_following: isFollowing, followers } : c));
  };

  const handleSelectShort = (id) => {
    const idx = shorts.findIndex(s => String(s.id) === String(id));
    if (idx >= 0 && listRef.current) {
      listRef.current.scrollTop = idx * listRef.current.clientHeight;
      setActiveIdx(idx);
    }
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
          onScroll={onScroll}
          className="mx-auto px-3 sm:px-0 overflow-y-auto"
          style={{ maxWidth: 420, height: 'calc(100vh - 265px)', minHeight: 420, scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
        >
          <div className="space-y-3 pb-2">
            {shorts.map((s, i) => (
              <div key={s.id} style={{ height: 'calc(100vh - 275px)', minHeight: 410 }}>
                <ShortPlayer short={s} active={i === activeIdx} muted={muted} onToggleMute={() => setMuted(m => !m)} onAuthorClick={setSelectedCreator} onFollowToggle={handleFollowToggle} token={token} />
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
    </div>
  );
}
