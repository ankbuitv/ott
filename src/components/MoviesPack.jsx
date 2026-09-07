import React, { useState, useEffect, useCallback } from 'react';
import { X, Bell, BellRing, Dices, Gift, Star, Ticket, BookOpen, Trophy, Filter } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../services/config';
import { authHeaders } from '../services/session';
import { getMovieProgress, isWatched } from '../services/movieList';
import { countryInfoOf, getTvDetails } from '../services/tmdb';
import { currentCountry } from '../services/geo';

async function api48(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders() },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || 'API_ERROR'), { code: j.code || j.error, status: res.status, payload: j });
  return j;
}

// ---------------------------------------------------------------
// Bộ nhớ local: trạng thái xem + follow series (mirror để hiện badge)
// ---------------------------------------------------------------
const K_STATUS = 'chrtv_watchplan_v1';
const K_FOLLOW = 'chrtv_series_follow_v1';
export function getWatchPlan() { try { return JSON.parse(localStorage.getItem(K_STATUS) || '{}'); } catch { return {}; } }
export function setWatchPlan(movie, status) {
  const all = getWatchPlan();
  const key = `${movie.media_type === 'tv' ? 'tv' : 'movie'}:${movie.id}`;
  if (status === null) delete all[key]; else all[key] = { s: status, at: Date.now() };
  try { localStorage.setItem(K_STATUS, JSON.stringify(all)); } catch {}
  return all[key] || null;
}
export function watchPlanOf(movie) { return getWatchPlan()[`${movie.media_type === 'tv' ? 'tv' : 'movie'}:${movie.id}`] || null; }

export function getFollowsLocal() { try { return JSON.parse(localStorage.getItem(K_FOLLOW) || '[]'); } catch { return []; } }
export function setFollowsLocal(list) { try { localStorage.setItem(K_FOLLOW, JSON.stringify(list || [])); } catch {} }

// ---------------------------------------------------------------------
// (#27) Thanh trạng thái: Muốn xem / Đang xem / Đã xem (+% series)
// ---------------------------------------------------------------------
export function WatchStatusBar({ movie, onChange }) {
  const { t } = useI18n();
  const [st, setSt] = useState(() => watchPlanOf(movie)?.s || null);
  const progress = movie.media_type === 'tv' ? null : getMovieProgress(movie);
  const pct = progress && progress.percent ? Math.round(progress.percent) : (isWatched(movie) ? 100 : 0);
  const opts = [
    { id: 'want', label: t('p48.want_watch'), icon: '🎬' },
    { id: 'watching', label: t('p48.watching_now'), icon: '▶️' },
    { id: 'watched', label: t('p48.watched'), icon: '✅' },
  ];
  const pick = (id) => {
    const cur = st === id ? null : id;
    setSt(cur);
    setWatchPlan(movie, cur);
    onChange && onChange(cur);
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-xl bg-black/30 border border-white/10 p-1 gap-1">
        {opts.map(o => (
          <button key={o.id} onClick={() => pick(o.id)}
            className={`px-2.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95 ${
              st === o.id ? 'grad-brand text-white shadow' : 'text-stone-400 hover:text-white'
            }`}>
            <span>{o.icon}</span><span className="hidden sm:inline">{o.label}</span>
          </button>
        ))}
      </div>
      {pct > 0 && !st && (
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-bold">
          <span className="w-14 h-1 rounded-full bg-black/50 overflow-hidden"><span className="block h-full bg-emerald-400" style={{ width: `${Math.min(100, pct)}%` }} /></span>
          {pct}%
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// (#8) Follow series: server + local mirror; trả fresh map khi có tập mới
// ---------------------------------------------------------------------
export function useSeriesFollows() {
  const { isAuthenticated } = useAuth();
  const [follows, setFollows] = useState([]);
  const [fresh, setFresh] = useState({}); // tmdb_id -> {season, episode}
  const load = useCallback(async () => {
    let list = getFollowsLocal();
    if (isAuthenticated) {
      try {
        const d = await api48('/api/movie/series-follow');
        list = (d.follows || []).map(f => ({ tmdb_id: Number(f.tmdb_id), season: Number(f.season) || 1, episode: Number(f.episode) || 1 }));
      } catch { /* giữ local */ }
    }
    setFollows(list);
    setFollowsLocal(list);
  }, [isAuthenticated]);
  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (movie, latest = null) => {
    const id = Number(movie?.id || movie?.tmdb_id || 0);
    if (!id) return;
    const isTv = movie.media_type === 'tv';
    if (!isTv) return;
    const had = follows.some(f => Number(f.tmdb_id) === id);
    if (isAuthenticated) {
      try {
        await api48('/api/movie/series-follow', { method: 'POST', body: { tmdb_id: id, follow: had, season: Number(latest?.season) || 1, episode: Number(latest?.episode) || 1 } });
      } catch { return; }
    }
    const next = had ? follows.filter(f => Number(f.tmdb_id) !== id) : [...follows, { tmdb_id: id, season: Number(latest?.season) || 1, episode: Number(latest?.episode) || 1 }];
    setFollows(next); setFollowsLocal(next);
    return !had;
  }, [follows, isAuthenticated]);

  // Soi tập mới: với mỗi series đang follow, đối chiếu tập phát sóng mới nhất
  // (TMDB) với tập đã xem gần nhất — đúng chuẩn #8 (badge "TẬP MỚI").
  const checkFresh = useCallback(async () => {
    const out = {};
    const fs = getFollowsLocal();
    if (!fs.length) { setFresh({}); return; }
    for (const f of fs.slice(0, 8)) {
      try {
        const d = await getTvDetails(f.tmdb_id);
        if (!d || !d.id) continue;
        const last = d.last_episode_to_air;
        if (!last) continue;
        if (Number(last.season_number) > Number(f.season) || (Number(last.season_number) === Number(f.season) && Number(last.episode_number) > Number(f.episode))) {
          // tập mới đã lên sóng so với nơi user dừng theo dõi
          out[f.tmdb_id] = { season: last.season_number, episode: last.episode_number };
        }
      } catch { /* bỏ qua */ }
    }
    setFresh(out);
  }, []);
  useEffect(() => { if (follows.length) checkFresh(); }, [follows, checkFresh]);
  return { follows, fresh, toggle, reload: load, checkFresh };
}

// Nút follow trên chi tiết (chỉ TV)
export function FollowSeriesBtn({ movie, follows, fresh, onToggle }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const id = Number(movie?.id || 0);
  const following = follows.some(f => Number(f.tmdb_id) === id);
  const f = fresh[id];
  if (movie?.media_type !== 'tv' || !id) return null;
  return (
    <button
      onClick={async () => {
        const nowFollowing = await onToggle(movie, f || { season: Number(movie.season) || 1, episode: Number(movie.episode) || 1 });
        if (nowFollowing === true) addToast(`🔔 Đã theo dõi series — báo khi có ${t('p48.new_ep').toLowerCase() || 'tập mới'}`, 'success');
        else if (nowFollowing === false) addToast('Đã bỏ theo dõi series', 'info');
      }}
      title={t('p48.follow_series')}
      className={`px-4 py-3.5 font-bold rounded-2xl flex items-center gap-2 border transition active:scale-95 ${following ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-white/[0.06] text-stone-200 border-white/10 hover:bg-white/[0.12]'}`}
    >
      {following ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
      <span className="hidden sm:inline text-[13px]">{following ? (f ? `TẬP MỚI S${f.season}E${f.episode}` : t('p48.following')) : t('p48.follow_series')}</span>
    </button>
  );
}

// ---------------------------------------------------------------------
// (#66) Roulette quay phim theo tâm trạng
// ---------------------------------------------------------------------
const MOODS = [
  { id: 'fun', label: '😂 Hài', genres: [35] },
  { id: 'action', label: '💥 Hành động', genres: [28, 80, 53] },
  { id: 'love', label: '❤️ Lãng mạn', genres: [10749, 10751] },
  { id: 'scare', label: '👻 Kinh dị', genres: [27, 9648] },
  { id: 'deep', label: '🧠 Tâm lý', genres: [18, 99] },
  { id: 'sci', label: '🚀 Viễn tưởng', genres: [878, 12] },
];
export function RouletteModal({ open, pool, onClose, onPick }) {
  const [spin, setSpin] = useState(false);
  const [idx, setIdx] = useState(0);
  const [mood, setMood] = useState(MOODS[0]);
  if (!open) return null;
  const list = pool.filter(m => (m.genre_ids || []).some(g => mood.genres.includes(g)));
  const roll = () => {
    if (!list.length) return;
    setSpin(true);
    const total = 18;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setIdx(Math.floor(Math.random() * list.length));
      if (i >= total) { clearInterval(iv); setSpin(false); const pick = list[Math.floor(Math.random() * list.length)]; onPick && onPick(pick); }
    }, 70);
  };
  const cur = list[idx % Math.max(1, list.length)] || null;
  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md modal-panel overflow-hidden anim-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Dices className="w-4 h-4 text-[#ff9a3d]" />Quay số chọn phim</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-stone-500">Chọn tâm trạng — xoay là ra phim phù hợp!</p>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map(m => (
              <button key={m.id} onClick={() => setMood(m)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border transition ${mood.id === m.id ? 'grad-brand text-white border-transparent' : 'bg-white/[0.05] border-white/10 text-stone-400 hover:text-white'}`}>{m.label}</button>
            ))}
          </div>
          {list.length > 0 && (
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4 text-center">
              <img src={cur?.poster_path ? `https://image.tmdb.org/t/p/w342${cur.poster_path}` : ''} alt="" onError={e => e.target.style.display = 'none'} className="mx-auto h-40 rounded-xl shadow-lg object-cover mb-2" />
              <p className={`font-black text-white text-sm transition ${spin ? 'opacity-60' : ''}`}>{cur?.title || cur?.name || '…'}</p>
              <p className="text-[10px] text-stone-500">{(cur?.vote_average || 0) > 0 ? `★ ${cur.vote_average.toFixed(1)} · ` : ''}{(cur?.release_date || cur?.first_air_date || '').slice(0, 4) || ''}</p>
            </div>
          )}
          {list.length === 0 && <p className="text-[11px] text-stone-600 italic text-center py-6">Không tìm thấy phim cho tâm trạng này trong danh mục hiện tại</p>}
          <button onClick={roll} disabled={spin || !list.length} className="w-full py-3 rounded-2xl grad-brand text-white text-[13px] font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]">
            <Dices className={`w-5 h-5 ${spin ? 'animate-spin' : ''}`} />{spin ? 'Đang quay…' : 'Quay số!'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// (#84) Wrapped cá nhân
// ---------------------------------------------------------------------
function fmtMin(sec) {
  if (!sec) return '0';
  if (sec < 60) return `${sec}p`;
  if (sec < 3600) return `${(sec / 60).toFixed(0)}h`;
  return `${(sec / 3600).toFixed(1)}h`;
}
export function WrappedModal({ open, onClose }) {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open || !isAuthenticated) return;
    api48('/api/wrapped').then(r => setD(r.wrapped || r)).catch(() => setErr('Chưa đủ dữ liệu'));
  }, [open, isAuthenticated]);
  if (!open) return null;
  const w = d;
  return (
    <div className="fixed inset-0 z-[240] bg-black/90 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg modal-panel anim-pop overflow-hidden text-center" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 relative" style={{ background: 'radial-gradient(500px 160px at 50% -20%, rgba(243,111,33,.3), transparent 75%)' }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
          <p className="text-[10px] font-black tracking-[0.3em] text-[#ff9a3d]">{t('p48.wrapped_title')}</p>
          <h2 className="text-2xl md:text-3xl font-black text-white mt-1">🎬 {w?.year || new Date().getFullYear()} của bạn</h2>
        </div>
        <div className="px-5 pb-6 space-y-2.5">
          {err && <p className="text-[12px] text-stone-500 py-6 italic">{err}</p>}
          {!err && !w && <p className="text-[12px] text-stone-500 py-6 italic">Đang tổng hợp…</p>}
          {w && w.success === false && <p className="text-[12px] text-stone-500 py-4 italic">{w.error || 'Chưa đủ dữ liệu'}</p>}
          {w && w.total_sec !== undefined && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[{ l: 'Kênh TV', v: fmtMin(w.minutes?.channel) }, { l: 'Phim', v: fmtMin(w.minutes?.movie) }, { l: 'Shorts', v: fmtMin(w.minutes?.short) }].map(x => (
                  <div key={x.l} className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3"><p className="text-lg font-black text-[#ff9a3d]">{x.v}</p><p className="text-[9px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">{x.l}</p></div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3 text-left"><p className="text-[9px] text-stone-500 font-bold uppercase tracking-wider">Nhiều giờ nhất</p><p className="text-[12px] font-bold text-white truncate mt-1">{w.top_channel?.name || w.top_movie?.name || w.top_short?.name || '—'}</p></div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3 text-left"><p className="text-[9px] text-stone-500 font-bold uppercase tracking-wider">Tổng cộng</p><p className="text-[12px] font-bold text-white mt-1">⏱ {fmtMin(w.total_sec)}</p></div>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 to-[#f36f21]/10 border border-amber-500/25 p-3 flex items-center justify-center gap-2">
                <Star className="w-4 h-4 text-amber-300 fill-current" /><span className="text-[12px] font-black text-amber-200">{w.xp || 0} XP</span>
                <span className="text-stone-600">•</span>
                <span className="text-[11px] text-stone-300 font-bold">{w.movies_started || 0} phim đã xem</span>
                <span className="text-stone-600">•</span>
                <span className="text-[11px] text-stone-300 font-bold">✅ {w.movies_finished || 0} xem xong</span>
              </div>
            </>
          )}
          <p className="text-[10px] text-stone-600 italic">Wrapped được tạo từ lịch sử xem của bạn — cập nhật theo thời gian thực.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// (#85) Link affiliate (vé rạp / sách) từ admin
// ---------------------------------------------------------------------
export function AffiliateChips({ movie }) {
  const { addToast } = useToast();
  const [affs, setAffs] = useState([]);
  useEffect(() => {
    api48('/api/affiliates').then(d => setAffs(d.affiliates || [])).catch(() => {});
  }, []);
  const title = movie?.title || movie?.name || '';
  if (!affs.length) return null;
  const open = (a) => {
    const url = String(a.url_template || '').replaceAll('{title}', encodeURIComponent(title)).replaceAll('{id}', String(movie?.id || ''));
    if (url.startsWith('http')) window.open(url, '_blank', 'noopener');
    else addToast('Chưa cấu hình link affiliate', 'info');
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {affs.slice(0, 3).map(a => (
        <button key={a.id} onClick={() => open(a)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-200 text-[10px] font-black hover:bg-violet-500/20 transition active:scale-95">
          {a.kind === 'cinema' ? <Ticket className="w-3 h-3" /> : a.kind === 'book' ? <BookOpen className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
          {a.label || a.name}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// (#28) Lọc nâng cao danh mục
// ---------------------------------------------------------------------
export function AdvancedFilters({ open, onClose, onApply, onClear, current }) {
  const [f, setF] = useState({ year: '', rating: 0, country: '', genre: '', sort: '' });
  useEffect(() => { if (open) setF(current || { year: '', rating: 0, country: '', genre: '', sort: '' }); }, [open, current]);
  if (!open) return null;
  const years = Array.from({ length: 18 }, (_, i) => String(new Date().getFullYear() - i));
  return (
    <div className="fixed inset-0 z-[240] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm modal-panel overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Filter className="w-4 h-4 text-[#ff9a3d]" />Lọc nâng cao</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">Năm phát hành</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setF({ ...f, year: '' })} className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold border ${!f.year ? 'bg-white text-black border-white' : 'bg-white/[0.05] border-white/10 text-stone-400'}`}>Tất cả</button>
              {years.slice(0, 12).map(y => (
                <button key={y} onClick={() => setF({ ...f, year: y })} className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold border ${f.year === y ? 'bg-white text-black border-white' : 'bg-white/[0.05] border-white/10 text-stone-400'}`}>{y}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">Điểm IMDb ≥</p>
            <div className="flex gap-1.5">
              {[0, 6, 7, 8].map(r => (
                <button key={r} onClick={() => setF({ ...f, rating: r })} className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-black border flex items-center justify-center gap-1 ${f.rating === r ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' : 'bg-white/[0.05] border-white/10 text-stone-400'}`}>{r === 0 ? 'Tất cả' : <><Star className="w-3 h-3 fill-current" />{r}+</>}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">Sắp xếp</p>
            <div className="flex gap-1.5">
              {[{ v: '', l: 'Mặc định' }, { v: 'rating', l: '★ Cao nhất' }, { v: 'year', l: 'Mới nhất' }].map(o => (
                <button key={o.v} onClick={() => setF({ ...f, sort: o.v })} className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-black border ${f.sort === o.v ? 'bg-[#f36f21]/15 text-[#ffb37a] border-[#f36f21]/40' : 'bg-white/[0.05] border-white/10 text-stone-400'}`}>{o.l}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClear} className="px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-stone-400 text-[12px] font-bold">Xoá bộ lọc</button>
            <button onClick={() => { onApply(f); onClose(); }} className="flex-1 py-2.5 rounded-xl grad-brand text-white text-[12px] font-black">Áp dụng</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// (#5) Đang hot tại 🇻🇳 (top kênh theo quốc gia từ heartbeat watch_cc)
// ---------------------------------------------------------------------
export function HotCountryRow({ onOpenChannel }) {
  const { addToast } = useToast();
  const [cc] = useState(() => (currentCountry() || 'VN').toUpperCase());
  const [top, setTop] = useState(null);
  const info = countryInfoOf(cc);
  useEffect(() => {
    api48(`/api/stats/top-country?cc=${cc}&hours=24`).then(d => { if (d.top && d.top.length) setTop(d.top); }).catch(() => {});
  }, [cc]);
  if (!top || !top.length) return null;
  return (
    <section className="px-6 md:px-8 mt-4">
      <div className="max-w-7xl mx-auto rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl grad-brand flex items-center justify-center"><Trophy className="w-4 h-4 text-white" /></span>
          <div>
            <h3 className="text-sm md:text-[15px] font-black leading-none flex items-center gap-1.5">{t('p48.geo_hot')} {info?.flag || '🌐'} {info?.name || cc}</h3>
            <p className="text-[9px] text-stone-500 font-semibold mt-0.5">Từ heartbeat xem trong 24 giờ qua</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none p-3">
          {top.slice(0, 10).map((ch, i) => (
            <button key={ch.channel_id} onClick={() => { onOpenChannel ? onOpenChannel(ch) : addToast(`📺 ${ch.name} — xem ở tab Truyền hình`, 'info'); }} className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:border-[#f36f21]/50 hover:bg-white/[0.07] transition text-left">
              <span className="font-black text-[#ff9a3d]">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white truncate max-w-[130px]">{ch.name}</p>
                <p className="text-[9px] text-stone-500">{ch.group_title || ''} · {(ch.views || 0)} lượt</p>
              </div>
              {ch.logo ? <img src={ch.logo} alt="" className="w-6 h-6 rounded-md object-contain bg-black/40" onError={e => e.target.style.display = 'none'} /> : null}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// Huy hiệu độ tuổi (#79)
export function AgeBadge({ movie }) {
  if (!movie) return null;
  const adult = !!movie.adult;
  const kidsGenre = (movie.genre_ids || []).some(g => [16, 10751, 10762].includes(g));
  const label = adult ? '18+' : (kidsGenre ? 'P' : '');
  if (!label) return null;
  return (
    <span title="Độ tuổi khuyến nghị" className={`px-1.5 py-0.5 rounded-md border text-[10px] font-black ${adult ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>{label}</span>
  );
}

export const fmtHot = fmtMin;
