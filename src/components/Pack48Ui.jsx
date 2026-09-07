import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Ticket, QrCode, Gift, Users, Tv, Copy, Check, Mic, Square, Pin, Star, Sparkles, Share2 } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../services/config';
import { authHeaders } from '../services/session';
import { mergeServerProgress } from '../services/movieList';
import ShareButtons, { buildDeepLink } from './ShareButtons';

// ---------- helpers ----------
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
const copyText = async (txt, ok) => {
  try { await navigator.clipboard.writeText(txt); ok && ok(); } catch { /* bỏ qua */ }
};

// =====================================================================
// Mã chia sẻ: Nhập mã (A/#1/#11/#35) + Tạo mã + Mã của tôi (#2)
// =====================================================================
export function CodesModal({ open, onClose, onOpenMovie, onPartyCode, onOpenPlaylist, mode = 'redeem' }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState(mode === 'my' ? 'my' : 'redeem');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);
  const [myCode, setMyCode] = useState('');
  const [copied, setCopied] = useState(false);

  const loadMy = useCallback(() => {
    if (!isAuthenticated) return;
    api48('/api/codes/my').then((d) => setMine(d.codes || [])).catch(() => {});
    api48('/api/codes', { method: 'POST', body: { kind: 'invite' } }).then((d) => { if (d.code) setMyCode(d.code); }).catch(() => {});
  }, [isAuthenticated]);
  useEffect(() => { if (open && tab === 'my') loadMy(); }, [open, tab, loadMy]);

  const redeem = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    try {
      const d = await api48(`/api/codes?code=${encodeURIComponent(c)}`);
      if (d.kind === 'invite') {
        // mã mời -> claim luôn
        const cl = await api48('/api/codes/claim', { method: 'POST', body: { code: c } });
        addToast(cl.message || t('p48.claim_invite') + ' ✓', 'success');
        setCode('');
        return;
      }
      if (d.kind === 'movie') { addToast(t('p48.code_ok'), 'success'); onOpenMovie && onOpenMovie({ id: d.tmdb_id, media_type: d.media_type, season: d.season, episode: d.episode }); onClose && onClose(); return; }
      if (d.kind === 'party') { addToast('🎉 ' + t('p48.code_ok'), 'success'); onPartyCode && onPartyCode(d.payload?.room || d.code); onClose && onClose(); return; }
      if (d.kind === 'playlist') { onOpenPlaylist && onOpenPlaylist(d.payload); addToast('🎬 Đã nhận playlist chia sẻ', 'success'); onClose && onClose(); return; }
      if (d.kind === 'challenge') { addToast(`🏆 #${d.payload?.hashtag || ''} — mở Shorts xem thử thách nhé`, 'success'); onClose && onClose(); return; }
      addToast(t('p48.code_ok'), 'success'); onClose && onClose();
    } catch (e) {
      addToast(e.code === 'EXPIRED' ? (e.message || t('p48.code_bad')) : t('p48.code_bad'), 'error');
    } finally { setBusy(false); }
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md modal-panel overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Ticket className="w-4 h-4 text-[#ff9a3d]" />Mã &amp; chia sẻ</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex gap-1 px-4 pt-3">
          {[{ id: 'redeem', label: '🎟️ Nhập mã' }, { id: 'my', label: '📋 Mã của tôi' }].map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all ${tab === x.id ? 'grad-brand text-white' : 'bg-white/[0.05] text-stone-400'}`}>{x.label}</button>
          ))}
        </div>
        <div className="p-4 space-y-3">
          {tab === 'redeem' && (
            <>
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32))}
                  onKeyDown={(e) => e.key === 'Enter' && redeem()}
                  placeholder="Nhập mã…" className="flex-1 px-3 py-3 bg-black/40 border border-white/10 rounded-xl text-[14px] font-mono tracking-[0.2em] text-white placeholder:tracking-normal placeholder:text-stone-600 focus:outline-none focus:border-[#f36f21]" />
                <button onClick={redeem} disabled={busy || !code} className="px-4 rounded-xl grad-brand text-white text-[12px] font-black disabled:opacity-40 active:scale-95">{busy ? '…' : t('p48.use')}</button>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Nhập <b className="text-stone-300">mã phim</b> (mở đúng phim/tập), <b className="text-stone-300">mã mời</b> (nhận +200 XP &amp; +3 ngày gói), <b className="text-stone-300">mã phòng xem chung</b>, <b className="text-stone-300">playlist</b> hay <b className="text-stone-300">kèo dự đoán</b> từ bạn bè.
              </p>
              {!isAuthenticated && <p className="text-[11px] text-amber-400/90 font-bold">Bạn cần đăng nhập để dùng mã mời / mã phòng.</p>}
            </>
          )}
          {tab === 'my' && (
            <>
              {myCode && (
                <div className="rounded-2xl bg-gradient-to-br from-[#f36f21]/15 to-[#7c2d12]/10 border border-[#f36f21]/30 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#ffb37a] flex items-center gap-1"><Gift className="w-3 h-3" />Mã mời của bạn — cả 2 nhận +200 XP &amp; +3 ngày gói</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 font-mono font-black text-white text-lg tracking-[0.25em]">{myCode}</span>
                    <button onClick={() => copyText(myCode, () => { setCopied(true); setTimeout(() => setCopied(false), 1200); addToast(t('p48.code_copied'), 'success'); })} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white">{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}</button>
                  </div>
                </div>
              )}
              {mine.filter((m) => m.kind === 'movie').slice(0, 10).length > 0 && (
                <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Mã phim đã tạo (10 phút)</p>
              )}
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {mine.filter((m) => m.kind === 'movie').slice(0, 10).map((m) => (
                  <div key={m.code} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/25 border border-white/[0.06] text-[11px]">
                    <span className="font-mono font-black text-[#ff9a3d]">{m.code}</span>
                    <span className="flex-1 truncate text-slate-300">{m.media_type === 'tv' ? `TV · S${m.season}E${m.episode}` : 'Phim'} · TMDB {m.tmdb_id}</span>
                    <button onClick={() => copyText(m.code, () => addToast(t('p48.code_copied'), 'success'))} className="text-slate-500 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {mine.length === 0 && !isAuthenticated && <p className="text-[11px] text-stone-600 italic">Đăng nhập để xem mã của bạn.</p>}
                {mine.length === 0 && isAuthenticated && <p className="text-[11px] text-stone-600 italic">Chưa tạo mã nào — vào phim bấm nút chia sẻ để tạo mã 6 ký tự nhé.</p>}
              </div>
              <ShareButtons url={myCode ? buildDeepLink({}) + '' : ''} title="" compact={false} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// (#1) Xem chung qua mã: tạo phòng + mời bằng mã; chat + đồng bộ kênh
// =====================================================================
export function PartyModal({ open, onClose, channel, onChangeChannel, userName }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const [room, setRoom] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [members, setMembers] = useState([]);
  const [text, setText] = useState('');
  const [hostState, setHostState] = useState(null);
  const feedRef = useRef(null);
  const myName = userName || user?.display_name || user?.username || 'Khách';

  useEffect(() => { if (!open) return undefined; const iv = setInterval(() => { if (room) poll(room); }, 2000); return () => clearInterval(iv); }, [open, room]); // eslint-disable-line

  const poll = useCallback(async (r) => {
    try {
      const d = await api48(`/api/party/feed?room=${encodeURIComponent(r)}&after=${feedRef.current || 0}`);
      if (d.messages && d.messages.length) {
        feedRef.current = d.messages[d.messages.length - 1].id;
        setMsgs((prev) => [...prev, ...d.messages].slice(-80));
      }
      setMembers((d.members || []).map((m) => m.name));
      if (d.state && d.state.channelId) {
        const same = hostStateRef.current && hostStateRef.current.channelId === d.state.channelId;
        setHostState(d.state);
        // host đổi kênh -> theo luôn
        if (!same && channel && channel.channel_id !== d.state.channelId && d.state.channelName && onChangeChannel) {
          addToast(`📺 Host chuyển sang ${d.state.channelName}`, 'info');
        }
      }
    } catch { /* tạm thời */ }
  }, [channel, addToast, onChangeChannel]); // eslint-disable-line
  const hostStateRef = useRef(null);
  hostStateRef.current = hostState;

  const syncState = useCallback(() => {
    if (!room || !channel) return;
    api48('/api/party/state', { method: 'POST', body: { room, channelId: channel.channel_id, channelName: channel.name } }).catch(() => {});
  }, [room, channel]);

  const create = async () => {
    if (!isAuthenticated) { addToast('Đăng nhập để tạo phòng xem chung', 'info'); return; }
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = 'party:' + Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    setRoom(r); feedRef.current = 0; setMsgs([]);
    try {
      await api48('/api/party/join', { method: 'POST', body: { room: r, name: myName, channelId: channel?.channel_id, channelName: channel?.name } });
    } catch {}
    const d = await api48('/api/codes', { method: 'POST', body: { kind: 'party', payload: { room: r }, ttl_min: 120 } }).catch(() => ({}));
    if (d.code) setInviteCode(d.code);
    addToast('🎉 Đã tạo phòng — gửi mã cho bạn bè!', 'success');
  };
  const joinByCode = async () => {
    // mã phòng direct hoặc mã share -> resolve /api/codes
    const raw = String(inviteCode || '').trim().toUpperCase();
    if (!raw) return;
    if (!raw.startsWith('PARTY:')) {
      try {
        const d = await api48(`/api/codes?code=${encodeURIComponent(raw)}`);
        const r = (d.kind === 'party' && d.payload?.room) || (raw.startsWith('party:') ? raw : null);
        if (r) { setRoom(r); setMsgs([]); try { await api48('/api/party/join', { method: 'POST', body: { room: r, name: myName, channelId: channel?.channel_id, channelName: channel?.name } }); } catch {} addToast('Đã vào phòng!', 'success'); return; }
        addToast(t('p48.code_bad'), 'error');
      } catch { addToast(t('p48.code_bad'), 'error'); return; }
    } else { setRoom(raw); setMsgs([]); try { await api48('/api/party/join', { method: 'POST', body: { room: raw, name: myName, channelId: channel?.channel_id, channelName: channel?.name } }); } catch {} }
  };
  const say = async () => {
    if (!text.trim() || !room) return;
    try { await api48('/api/party/say', { method: 'POST', body: { room, name: myName, text: text.trim() } }); setText(''); } catch { addToast('Gửi thất bại', 'error'); }
  };
  useEffect(() => { if (room) syncState(); }, [room, channel]); // eslint-disable-line
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md modal-panel overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" />Xem chung cùng bạn bè</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {!room ? (
            <>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
                <p className="text-[11px] text-stone-400">Bạn đang xem <b className="text-white">{channel?.name || '—'}</b>. Tạo phòng để bạn bè vào xem cùng (chat + tự chuyển kênh theo host).</p>
                <button onClick={create} className="w-full py-2.5 rounded-xl grad-brand text-white text-[12px] font-black flex items-center justify-center gap-1.5"><QrCode className="w-4 h-4" />Tạo phòng &amp; lấy mã mời</button>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="Mã phòng / mã chia sẻ…" className="flex-1 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[12px] font-mono text-white focus:outline-none focus:border-emerald-500" />
                <button onClick={joinByCode} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-black active:scale-95">Vào phòng</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl bg-emerald-950/30 border border-emerald-500/25 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-emerald-300">PHÒNG {room.toUpperCase().replace('PARTY:', '')} · {members.length} người</p>
                  <p className="text-[10px] text-stone-500 truncate">Đang phát: {hostState?.channelName || channel?.name || '…'}</p>
                </div>
                <div className="flex gap-1.5">
                  {inviteCode && (
                    <button onClick={() => copyText(inviteCode, () => addToast(t('p48.code_copied'), 'success'))} className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-black flex items-center gap-1"><Copy className="w-3 h-3" />Mã: {inviteCode}</button>
                  )}
                </div>
              </div>
              {hostState && hostState.channelId && channel && channel.channel_id !== hostState.channelId && onChangeChannel && (
                <button onClick={async () => {
                  addToast(`Đang chuyển sang ${hostState.channelName}…`, 'info');
                  // tìm kênh theo id rồi chuyển
                  try {
                    const d = await fetch(`${API_BASE}/api/channels`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
                    const ch = (d.channels || []).find((c) => c.channel_id === hostState.channelId);
                    if (ch) onChangeChannel(ch);
                    else onChangeChannel({ channel_id: hostState.channelId, name: hostState.channelName, group_title: '' });
                  } catch {}
                }} className="w-full py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-[0.98]">
                  <Tv className="w-3.5 h-3.5" /> Theo kênh host: {hostState.channelName}
                </button>
              )}
              <div className="h-44 rounded-xl bg-black/30 border border-white/[0.07] p-2 overflow-y-auto space-y-1">
                {msgs.length === 0 && <p className="text-[10px] text-stone-600 italic">Chưa có tin nhắn — bắt đầu chat nào!</p>}
                {msgs.map((m, i) => (
                  <div key={m.id || i} className={`text-[11px] ${m.kind === 'reaction' ? 'text-amber-300 text-center' : m.kind === 'join' || m.kind === 'leave' ? 'text-stone-600 italic text-center' : ''}`}>
                    {m.kind === 'chat' && <><b className="text-stone-200">{m.from_name}:</b> <span className="text-stone-300">{m.text}</span></>}
                    {m.kind === 'reaction' && <span>{m.text}</span>}
                    {m.kind === 'join' && <span>👋 {m.text}</span>}
                    {m.kind === 'leave' && <span>👋 {m.text}</span>}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {['🔥', '😂', '⚽', '😱', '❤️', '👏'].map((em) => (
                  <button key={em} onClick={async () => { try { await api48('/api/party/react', { method: 'POST', body: { room, name: myName, emoji: em } }); } catch {} }} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/15 text-sm">{em}</button>
                ))}
                <input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} onKeyDown={(e) => e.key === 'Enter' && say()} placeholder="Chat…" className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-[12px] text-white focus:outline-none focus:border-emerald-500" />
                <button onClick={say} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[12px] font-black active:scale-95">Gửi</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// (#7) Resume đa thiết bị: mã 6 số phone → TV mở tiếp đúng tập
// =====================================================================
export function ResumeModal({ open, onClose, onResumeMovie }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState(isAuthenticated ? 'give' : 'take');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [ttl, setTtl] = useState(0);
  const gen = async () => {
    setBusy(true);
    try {
      const d = await api48('/api/movie/progress/code', { method: 'POST' });
      setCode(d.code || '');
      setTtl(d.ttl_sec || 120);
    } catch { addToast('Đăng nhập để tạo mã', 'error'); }
    setBusy(false);
  };
  const take = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    try {
      const d = await api48(`/api/resume?code=${code}`);
      if (d.empty) { addToast('Tài khoản này chưa xem gì — thử điện thoại khác?', 'info'); return; }
      // gộp progress server vào danh sách "Xem tiếp" local để lần sau mở tiếp đúng vị trí
      try {
        mergeServerProgress([{ ...d.item, id: d.item.tmdb_id, media_type: d.item.media_type }]);
      } catch { /* không tới lượt */ }
      addToast(`🎬 ${d.item?.title} — mở tiếp tập ${d.item?.episode || 1}!`, 'success');
      onResumeMovie && onResumeMovie({ id: d.item.tmdb_id, media_type: d.item.media_type, season: d.item.season, episode: d.item.episode });
      onClose && onClose();
    } catch (e) { addToast(e.message || 'Mã không đúng', 'error'); } finally { setBusy(false); }
  };
  useEffect(() => { if (open && mode === 'give' && !code) gen(); }, [open, mode]); // eslint-disable-line
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[240] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm modal-panel overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><Tv className="w-4 h-4 text-[#ff9a3d]" />{t('p48.resume_code_title')}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-1.5">
            {[{ id: 'give', label: '📱 Điện thoại (gửi lên TV)' }, { id: 'take', label: '📺 TV (nhập mã)' }].map((x) => (
              <button key={x.id} onClick={() => { setMode(x.id); setCode(''); }} className={`px-3 py-1.5 rounded-full text-[10px] font-black ${mode === x.id ? 'grad-brand text-white' : 'bg-white/[0.05] text-stone-400'}`}>{x.label}</button>
            ))}
          </div>
          {mode === 'give' ? (
            <>
              <p className="text-[11px] text-stone-500 leading-relaxed">{t('p48.resume_code_hint')}</p>
              {code ? (
                <div className="text-center py-4 bg-black/30 border border-dashed border-[#f36f21]/50 rounded-2xl">
                  <p className="font-mono text-4xl font-black tracking-[0.4em] text-[#ff9a3d]">{code}</p>
                  <p className="text-[10px] text-stone-500 mt-2">Hết hạn sau {ttl}s · TV nhập xong là tự xoá</p>
                  <button onClick={gen} className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 text-[11px] font-bold text-stone-300 hover:bg-white/15">Tạo mã mới</button>
                </div>
              ) : <p className="text-[11px] text-stone-500">Đang tạo mã… {busy && '⏳'}</p>}
            </>
          ) : (
            <>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && take()} inputMode="numeric" placeholder="• • • • • •" className="w-full text-center font-mono text-3xl font-black tracking-[0.5em] py-3 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#f36f21]" />
              <button onClick={take} disabled={busy || code.length !== 6} className="w-full py-2.5 rounded-xl grad-brand text-white text-[12px] font-black disabled:opacity-40">{busy ? '…' : 'Đồng bộ & xem tiếp'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Voice note (gắn phút) cho bình luận — #9 + #68
// =====================================================================
export function useVoiceComment() {
  const { addToast } = useToast();
  const recRef = useRef(null);
  const [rec, setRec] = useState({ on: false, seconds: 0, dataUrl: '' });
  const timerRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      recRef.current = { mr, stream };
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch {}
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (blob.size > 500 * 1024) { addToast('Ghi chú thoại quá lớn — hãy nói ngắn hơn 30 giây', 'error'); setRec({ on: false, seconds: 0, dataUrl: '' }); return; }
        const reader = new FileReader();
        reader.onloadend = () => setRec({ on: false, seconds: 0, dataUrl: String(reader.result || '').slice(0, 600000) });
        reader.readAsDataURL(blob);
      };
      mr.start();
      let s = 0;
      timerRef.current = setInterval(() => { s++; setRec((r) => ({ ...r, seconds: s })); if (s >= 30) stop(); }, 1000);
      setRec({ on: true, seconds: 0, dataUrl: '' });
      addToast('🎙️ Đang ghi — nói xong bấm dừng', 'info');
    } catch { addToast('Không truy cập được micro', 'error'); }
  };
  const stop = () => {
    clearInterval(timerRef.current);
    const mr = recRef.current?.mr;
    if (mr && mr.state !== 'inactive') mr.stop();
    recRef.current = null;
  };
  const clear = () => setRec({ on: false, seconds: 0, dataUrl: '' });
  return { rec, start, stop, clear };
}

export function fmtTstamp(sec) {
  if (!Number.isFinite(sec) || sec < 0) return null;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
