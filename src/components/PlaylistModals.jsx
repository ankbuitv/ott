import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Share2, Film, Tv, Plus, ListVideo } from 'lucide-react';
import { API_BASE } from '../services/config';
import { authHeaders } from '../services/session';
import { imgPath } from '../services/tmdb';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

function authFetch(path, opts = {}) {
  return fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders() },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then((r) => r.json().catch(() => ({})));
}
const copyText = async (txt) => {
  try { await navigator.clipboard.writeText(txt); return true; } catch { return false; }
};

function Poster({ item, size = 'w185', className = '' }) {
  const [err, setErr] = useState(false);
  const src = item.poster_path && !err ? imgPath(item.poster_path, size) : null;
  const Icon = item.media_type === 'tv' ? Tv : Film;
  return (
    <div className={`relative overflow-hidden bg-[#1c1d24] ${className}`}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setErr(true)} />
        : <div className="w-full h-full flex items-center justify-center"><Icon className="w-6 h-6 text-stone-600" /></div>}
      <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/75 text-[8px] font-black tracking-wider text-white">{item.media_type === 'tv' ? 'TV' : 'PHIM'}</span>
    </div>
  );
}

// =====================================================================
// (#11) Soạn playlist cá nhân từ My List → mã 6 ký tự (kind=playlist)
// =====================================================================
export function SharePlaylistModal({ list, onClose }) {
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const [sel, setSel] = useState(() => new Set(list.map((m) => `${m.media_type === 'tv' ? 'tv' : 'movie'}-${m.id}`)));
  const [name, setName] = useState('Playlist của tôi');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null); // { code, name, items }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSel(new Set(list.map((m) => `${m.media_type === 'tv' ? 'tv' : 'movie'}-${m.id}`)));
  }, [list]);

  const toggle = (k) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const create = async () => {
    if (!isAuthenticated) { addToast('Đăng nhập để tạo mã chia sẻ playlist', 'warning'); return; }
    const picked = list.filter((m) => sel.has(`${m.media_type === 'tv' ? 'tv' : 'movie'}-${m.id}`));
    if (picked.length === 0) { addToast('Chọn ít nhất 1 phim trong playlist', 'info'); return; }
    setBusy(true);
    try {
      const payload = { title: name.trim().slice(0, 80) || 'Playlist của tôi', items: picked.map((m) => ({ tmdb_id: m.id, media_type: m.media_type === 'tv' ? 'tv' : 'movie', title: m.title, poster_path: m.poster_path || '' })) };
      const d = await authFetch('/api/codes', { method: 'POST', body: { kind: 'playlist', payload, ttl_min: 60 * 24 } });
      if (!d.code) throw new Error(d.error || 'NO_CODE');
      setMade({ code: d.code, name: payload.title, items: picked });
      addToast('Đã tạo mã playlist ✓', 'success');
    } catch (e) { addToast(e.message || 'Lỗi tạo mã', 'error'); }
    setBusy(false);
  };

  const share = async () => {
    if (!made) return;
    const text = `🎬 CHRTV — Playlist "${made.name}" (${made.items.length} phim)\nMã: ${made.code}\nVào tab Phim → Nhập mã 🎟️ để mở.`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Playlist CHRTV', text }); return; }
      await copyText(text);
      addToast('Đã chép lời mời — gửi cho bạn bè nhé!', 'success');
    } catch { addToast('Lỗi chia sẻ', 'error'); }
  };

  const close = () => { setMade(null); setSel(new Set()); onClose(); };

  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={close}>
      <div className="w-full max-w-lg modal-panel overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><ListVideo className="w-4 h-4 text-[#ff9a3d]" />Chia sẻ playlist từ My List</p>
          <button onClick={close} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        {!made ? (
          <div className="p-4 space-y-3 overflow-y-auto">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Tên playlist…" className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] font-bold text-white focus:outline-none focus:border-[#f36f21]" />
            <p className="text-[11px] text-stone-500">Tích chọn phim muốn đưa vào playlist — bạn bè nhập mã là xem được ngay.</p>
            {list.length === 0 && <p className="text-[12px] text-stone-500 italic text-center py-8">My List đang trống — thêm phim bằng nút “My List” trong chi tiết phim nhé.</p>}
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {list.map((m) => {
                const k = `${m.media_type === 'tv' ? 'tv' : 'movie'}-${m.id}`;
                const on = sel.has(k);
                return (
                  <button key={k} onClick={() => toggle(k)} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl border text-left transition ${on ? 'border-[#f36f21]/45 bg-[#f36f21]/[0.07]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                    <span className={`w-[18px] h-[18px] shrink-0 rounded-md border flex items-center justify-center ${on ? 'bg-[#f36f21] border-[#f36f21]' : 'border-white/25'}`}>{on && <Check className="w-3 h-3 text-white" />}</span>
                    <Poster item={m} className="w-9 h-[54px] rounded-md shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-bold text-white truncate">{m.title}</span>
                      <span className="text-[9px] text-stone-500">{m.media_type === 'tv' ? 'TV series' : 'Phim'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-[#f36f21]/15 to-[#7c2d12]/10 border border-[#f36f21]/30 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#ffb37a]">Mã playlist “{made.name}” ({made.items.length} phim)</p>
              <p className="my-2 font-mono font-black text-white text-3xl tracking-[0.3em]">{made.code}</p>
              <p className="text-[10px] text-stone-500">Có hạn 24 giờ — bạn bè vào <b className="text-stone-300">Phim → Nhập mã 🎟️</b></p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => copyText(made.code).then((okk) => { if (okk) { setCopied(true); setTimeout(() => setCopied(false), 1200); addToast('Đã chép mã', 'success'); } })} className="flex-1 py-2.5 rounded-xl bg-white/[0.07] border border-white/12 text-white text-[12px] font-black flex items-center justify-center gap-1.5 hover:bg-white/[0.14]">{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} Chép mã</button>
                <button onClick={share} className="flex-1 py-2.5 rounded-xl grad-brand text-white text-[12px] font-black flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" /> Gửi bạn bè</button>
              </div>
            </div>
            <button onClick={() => setMade(null)} className="w-full py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-bold text-stone-300 hover:bg-white/[0.1]">← Tạo playlist khác</button>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// (#11) Mở playlist bạn bè gửi qua mã — bấm phim là xem, thêm cả list
// =====================================================================
export function PlaylistViewModal({ payload, onClose, onOpen, onAddAll }) {
  const { addToast } = useToast();
  const items = (payload?.items || []).map((it) => ({ id: Number(it.tmdb_id || it.id || 0), media_type: it.media_type === 'tv' ? 'tv' : 'movie', title: it.title || it.name || '', poster_path: it.poster_path || '' })).filter((m) => m.id);
  const fromName = payload?.from_name || '';

  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl modal-panel overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <p className="text-[13px] font-black text-white flex items-center gap-2 truncate"><ListVideo className="w-4 h-4 text-[#ff9a3d] shrink-0" />{payload?.title || 'Playlist chia sẻ'}{fromName && <span className="text-[10px] text-stone-500 font-bold">· từ {fromName}</span>}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 shrink-0"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          {items.length === 0 ? <p className="text-[12px] text-stone-500 italic text-center py-10">Playlist trống hoặc đã hết hạn.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {items.map((m) => (
                <button key={`${m.media_type}-${m.id}`} onClick={() => onOpen && onOpen(m)} className="group text-left active:scale-[0.98] transition">
                  <Poster item={m} className="w-full aspect-[2/3] rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.02] transition shadow" />
                  <p className="text-[10px] font-bold mt-1.5 truncate text-stone-200 group-hover:text-white">{m.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="px-4 py-3 border-t border-white/10 shrink-0">
            <button onClick={() => { onAddAll && onAddAll(items); addToast(`Đã thêm ${items.length} phim vào My List ❤️`, 'success'); }} className="w-full py-2.5 rounded-xl bg-white/[0.07] border border-white/12 text-[12px] font-black text-white flex items-center justify-center gap-1.5 hover:bg-white/[0.14]"><Plus className="w-4 h-4" /> Thêm tất cả vào My List</button>
          </div>
        )}
      </div>
    </div>
  );
}
