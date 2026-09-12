import React, { useState, useEffect } from 'react';
import { Film, Eye, Gift, CreditCard, Megaphone, Clock, MessageCircle, Target, FileSpreadsheet, Trash2, Check, X, Plus, Activity, Flag, RefreshCw, Bug, MapPin, ShieldAlert, Radio, HandCoins, Image, Palette, Sparkles } from 'lucide-react';
import { THEME_PRESETS } from '../services/siteTheme.js';

// Các tab admin mới: trực tiếp, gift, thanh toán, QC, lịch đăng, bình luận, dự đoán, báo cáo.
const inp = 'w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#f36f21]/50';
const btnP = 'px-3 py-2 bg-[#f36f21] hover:bg-[#e05f0f] text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5';
const btnG = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5';

async function api(BASE, headers, path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers, ...opts });
  return r.json().catch(() => ({}));
}
function fmtTime(ts) {
  if (!ts) return '';
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 5) return 'vừa xong';
  if (s < 60) return `${s}s trước`;
  return `${Math.floor(s / 60)}′ trước`;
}

// ---- Ai đang xem gì (realtime) ----
export function LiveTab({ BASE, headers }) {
  const [viewers, setViewers] = useState([]);
  useEffect(() => {
    let on = true;
    const load = () => api(BASE, headers, '/admin/presence').then(d => { if (on) setViewers(d.viewers || []); }).catch(() => {});
    load();
    const iv = setInterval(load, 10000);
    return () => { on = false; clearInterval(iv); };
  }, [BASE]);
  return (
    <div className="p-4 space-y-2">
      <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-emerald-400" />{viewers.length} người đang xem (tự refresh 10s)</p>
      {viewers.length === 0 && <p className="text-[11px] text-slate-600 italic">Chưa có ai online.</p>}
      {viewers.map(v => (
        <div key={v.sid} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[12px] font-bold text-white truncate">{v.name || 'Khách'}</span>
          <span className="text-[10px] text-slate-500 shrink-0">{v.kind === 'movie' ? '🎬' : v.kind === 'short' ? '▶️' : v.kind === 'sport' ? '⚽' : '📺'}</span>
          <span className="flex-1 text-[11px] text-slate-400 truncate">{v.ref_name || v.ref_id}</span>
          <span className="text-[10px] text-slate-600 shrink-0">{fmtTime(v.updated_at)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Gift code ----
export function GiftsTab({ BASE, headers, addToast }) {
  const [gifts, setGifts] = useState([]);
  const [form, setForm] = useState({ code: '', plan: 'signature', days: 30, max_uses: 1, note: '' });
  const load = () => api(BASE, headers, '/admin/gifts').then(d => setGifts(d.gifts || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const create = async (e) => {
    e.preventDefault();
    const d = await api(BASE, headers, '/admin/gifts', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast(`Đã tạo mã: ${d.code}`, 'success'); setForm({ code: '', plan: 'signature', days: 30, max_uses: 1, note: '' }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      {gifts.map(g => (
        <div key={g.code} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
          <span className={`font-mono text-[12px] font-bold ${g.is_active ? 'text-fuchsia-300' : 'text-slate-600 line-through'}`}>{g.code}</span>
          <span className="text-[10px] text-slate-400">{g.plan} · {g.days} ngày · {g.used}/{g.max_uses}</span>
          <span className="flex-1" />
          <button onClick={async () => { await api(BASE, headers, '/admin/gifts', { method: 'PUT', body: JSON.stringify({ code: g.code, is_active: g.is_active ? 0 : 1 }) }); load(); }} className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1">{g.is_active ? 'Tắt' : 'Bật'}</button>
          <button onClick={async () => { if (!confirm('Xoá mã ' + g.code + '?')) return; await api(BASE, headers, '/admin/gifts', { method: 'DELETE', body: JSON.stringify({ code: g.code }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <form onSubmit={create} className="grid grid-cols-2 gap-2 pt-2">
        <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Mã (trống = tự sinh)" className={inp + ' col-span-2 font-mono'} />
        <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className={inp}>
          <option value="signature">Signature</option><option value="elite">Elite</option><option value="ultimate">Ultimate</option><option value="recreational">Recreational</option><option value="standard">Standard</option>
        </select>
        <input type="number" min="1" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} placeholder="Số ngày" className={inp} />
        <input type="number" min="1" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} placeholder="Lượt dùng" className={inp} />
        <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú" className={inp} />
        <button type="submit" className={btnP + ' col-span-2 justify-center'}><Plus className="w-3.5 h-3.5" /> Tạo mã</button>
      </form>
    </div>
  );
}

// ---- Thanh toán ----
export function PaymentsTab({ BASE, headers, addToast }) {
  const [list, setList] = useState([]);
  const [cfg, setCfg] = useState({ bank_id: '', account_no: '', account_name: '', template: 'compact2', note: '', sepay_token: '' });
  const load = () => {
    api(BASE, headers, '/admin/payments').then(d => setList(d.payments || [])).catch(() => {});
    api(BASE, headers, '/admin/payment-config').then(d => { if (d.config) setCfg({ ...cfg, ...d.config, sepay_token: '' }); }).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  const set = async (order_code, status) => {
    const d = await api(BASE, headers, '/admin/payments', { method: 'PUT', body: JSON.stringify({ order_code, status }) });
    if (d.success) { addToast('Đã cập nhật.', 'success'); load(); } else addToast(d.error || 'Lỗi', 'error');
  };
  const saveCfg = async (e) => {
    e.preventDefault();
    const d = await api(BASE, headers, '/admin/payment-config', { method: 'PUT', body: JSON.stringify(cfg) });
    if (d.success) addToast('Đã lưu cấu hình nhận tiền.', 'success'); else addToast(d.error || 'Lỗi', 'error');
  };
  const stColor = { paid: 'text-emerald-400', claimed: 'text-amber-300', pending: 'text-slate-400', rejected: 'text-red-400', underpaid: 'text-orange-400' };
  return (
    <div className="p-4 space-y-2">
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Đơn hàng</p>
      {list.length === 0 && <p className="text-[11px] text-slate-600 italic">Chưa có đơn nào.</p>}
      {list.slice(0, 30).map(p => (
        <div key={p.order_code} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2 flex-wrap">
          <span className="font-mono text-[11px] font-bold text-white">{p.order_code}</span>
          <span className="text-[10px] text-slate-400">{p.username} · {p.plan} · {Number(p.amount || 0).toLocaleString()}đ</span>
          <span className={`text-[10px] font-black uppercase ${stColor[p.status] || 'text-slate-400'}`}>{p.status}</span>
          <span className="flex-1" />
          {p.status !== 'paid' && <button onClick={() => set(p.order_code, 'paid')} title="Duyệt + kích hoạt gói" className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"><Check className="w-4 h-4" /></button>}
          {p.status !== 'rejected' && p.status !== 'paid' && <button onClick={() => set(p.order_code, 'rejected')} title="Từ chối" className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg"><X className="w-4 h-4" /></button>}
        </div>
      ))}
      <form onSubmit={saveCfg} className="space-y-2 pt-2 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Tài khoản nhận tiền (VietQR)</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={cfg.bank_id} onChange={e => setCfg({ ...cfg, bank_id: e.target.value.toUpperCase() })} placeholder="Mã NH (VD: MBBANK, VCB)" className={inp} />
          <input value={cfg.account_no} onChange={e => setCfg({ ...cfg, account_no: e.target.value })} placeholder="Số tài khoản" className={inp} />
          <input value={cfg.account_name} onChange={e => setCfg({ ...cfg, account_name: e.target.value })} placeholder="Chủ tài khoản" className={inp + ' col-span-2'} />
          <input value={cfg.sepay_token} onChange={e => setCfg({ ...cfg, sepay_token: e.target.value })} placeholder="SePay API token (tự động duyệt — để trống giữ cũ)" type="password" className={inp + ' col-span-2'} />
        </div>
        <p className="text-[10px] text-slate-600">Webhook SePay trỏ về: <code className="text-slate-400">/api/payments/sepay-webhook</code> (header Authorization: Apikey)</p>
        <button type="submit" className={btnP + ' w-full justify-center'}>Lưu cấu hình</button>
      </form>
    </div>
  );
}

// ---- Quảng cáo ----
// 'preroll' = quảng cáo chạy TRƯỚC khi vào kênh/phim (tối đa 5 lần/giờ mỗi người xem;
// elite & signature không thấy quảng cáo, ultimate bỏ qua sau 5s, recreational 10s, standard 30s)
const SLOTS = ['preroll', 'home', 'movies', 'sports', 'community', 'banner'];
export function AdsTab({ BASE, headers, addToast }) {
  const [ads, setAds] = useState([]);
  const [form, setForm] = useState({ slot: 'home', title: '', image_url: '', link_url: '', video_url: '', starts_at: '', ends_at: '', sort_order: 0 });
  const [editing, setEditing] = useState(null);
  const load = () => api(BASE, headers, '/admin/ads').then(d => setAds(d.ads || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    const d = editing
      ? await api(BASE, headers, '/admin/ads', { method: 'PUT', body: JSON.stringify({ ...form, id: editing }) })
      : await api(BASE, headers, '/admin/ads', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast('Đã lưu QC.', 'success'); setEditing(null); setForm({ slot: 'home', title: '', image_url: '', link_url: '', video_url: '', starts_at: '', ends_at: '', sort_order: 0 }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      {ads.map(a => (
        <div key={a.id} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
          <span className="text-[10px] font-black uppercase text-sky-300 shrink-0">{a.slot}</span>
          <span className="flex-1 text-[12px] font-bold text-white truncate">{a.title || '(không tên)'}</span>
          <span className="text-[10px] text-slate-500">{a.is_active ? 'BẬT' : 'TẮT'}</span>
          <button onClick={() => { setEditing(a.id); setForm({ slot: a.slot, title: a.title || '', image_url: a.image_url || '', link_url: a.link_url || '', video_url: a.video_url || '', starts_at: (a.starts_at || '').replace(' ', 'T').slice(0, 16), ends_at: (a.ends_at || '').replace(' ', 'T').slice(0, 16), sort_order: a.sort_order || 0 }); }} className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1">Sửa</button>
          <button onClick={async () => { if (!confirm('Xoá QC này?')) return; await api(BASE, headers, '/admin/ads', { method: 'DELETE', body: JSON.stringify({ id: a.id }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <form onSubmit={save} className="space-y-2 pt-2 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" />{editing ? `Sửa QC #${editing}` : 'Thêm QC mới'}</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.slot} onChange={e => setForm({ ...form, slot: e.target.value })} className={inp}>{SLOTS.map(s => <option key={s} value={s}>{s === 'preroll' ? 'preroll — chạy trước kênh/phim' : s}</option>)}</select>
          <input value={form.sort_order} type="number" onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder="Thứ tự" className={inp} />
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Tiêu đề" className={inp + ' col-span-2'} />
          <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="URL ảnh banner" className={inp + ' col-span-2'} />
          <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="URL video (tùy chọn)" className={inp + ' col-span-2'} />
          <input value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} placeholder="Link khi bấm" className={inp + ' col-span-2'} />
          <label className="text-[10px] text-slate-500">Hiện từ<input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className={inp + ' mt-0.5'} /></label>
          <label className="text-[10px] text-slate-500">Đến<input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className={inp + ' mt-0.5'} /></label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={btnP + ' flex-1 justify-center'}>{editing ? 'Cập nhật' : 'Thêm'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ slot: 'home', title: '', image_url: '', link_url: '', video_url: '', starts_at: '', ends_at: '', sort_order: 0 }); }} className={btnG}>Huỷ</button>}
        </div>
      </form>
    </div>
  );
}

// ---- Lịch đăng ----
export function SchedTab({ BASE, headers, addToast }) {
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState({ kind: 'broadcast', title: '', body: '', link_value: '', image_url: '', publish_at: '', end_at: '' });
  const [prev, setPrev] = useState(null); // {post, preview}
  const load = () => api(BASE, headers, '/admin/scheduled').then(d => setPosts(d.posts || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    if (!form.publish_at || !form.body) { addToast('Cần nội dung + giờ đăng', 'error'); return; }
    const d = await api(BASE, headers, '/admin/scheduled', { method: 'POST', body: JSON.stringify({ ...form, publish_at: form.publish_at.replace('T', ' '), end_at: form.end_at ? form.end_at.replace('T', ' ') : '' }) });
    if (d.success) { addToast('Đã hẹn giờ đăng.', 'success'); setForm({ kind: 'broadcast', title: '', body: '', link_value: '', image_url: '', publish_at: '', end_at: '' }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  const doPreview = async (id) => {
    const d = await api(BASE, headers, '/admin/scheduled/preview', { method: 'POST', body: JSON.stringify({ id }) });
    setPrev(d.success ? { post: d.post, preview: d.preview } : null);
  };
  return (
    <div className="p-4 space-y-2">
      <p className="text-[10px] text-slate-500">Tới giờ hệ thống tự đẩy ra app (không cần cron). Có thể đặt giờ <b className="text-slate-300">tự hết hiệu lực (end_at)</b> và bật/tắt từng lịch.</p>
      {posts.map(p => (
        <div key={p.id}>
          <div className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
            <span className={`text-[10px] font-black uppercase shrink-0 ${p.is_done ? 'text-emerald-400' : p.is_active === 0 ? 'text-slate-600' : 'text-amber-300'}`}>{p.is_done ? '✓' : p.is_active === 0 ? '⏸' : '⏳'} {p.kind}</span>
            <span className="flex-1 min-w-0"><span className="block text-[12px] font-bold text-white truncate">{p.title || p.body}</span><span className="block text-[10px] text-slate-500">{p.publish_at}{p.end_at ? ` → hết ${p.end_at}` : ''}</span></span>
            <button onClick={() => doPreview(p.id)} title="Xem trước" className="text-slate-400 hover:text-white px-1.5"><Eye className="w-3.5 h-3.5" /></button>
            <button onClick={async () => { await api(BASE, headers, '/admin/scheduled', { method: 'PUT', body: JSON.stringify({ id: p.id, is_active: p.is_active === 0 ? 1 : 0 }) }); load(); }} className="text-[10px] font-bold text-slate-400 hover:text-white px-1">{p.is_active === 0 ? 'Bật' : 'Ngừng'}</button>
            <button onClick={async () => { if (!confirm('Xoá lịch này?')) return; await api(BASE, headers, '/admin/scheduled', { method: 'DELETE', body: JSON.stringify({ id: p.id }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {prev && prev.post && prev.post.id === p.id && (
            <div className="mt-1 rounded-xl bg-sky-950/30 border border-sky-500/20 px-3 py-2 text-[11px] text-slate-300">
              <b className="text-sky-300">Xem trước:</b> {prev.preview?.title ? <><b>{prev.preview.title}</b> — </> : ''}{prev.preview?.message || prev.preview?.body || prev.preview?.subtitle || '(rỗng)'}
              {prev.preview?.expires_at ? <span className="text-slate-500"> · tự tắt {new Date(prev.preview.expires_at * 1000).toLocaleString('vi-VN')}</span> : null}
              <button onClick={() => setPrev(null)} className="ml-2 text-slate-500 hover:text-white">✕</button>
            </div>
          )}
        </div>
      ))}
      <form onSubmit={save} className="space-y-2 pt-2 border-t border-slate-800/40">
        <div className="grid grid-cols-2 gap-2">
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={inp}>
            <option value="broadcast">Banner chạy chữ</option><option value="notify">Thông báo</option><option value="event">Sự kiện home</option>
          </select>
          <input type="datetime-local" value={form.publish_at} onChange={e => setForm({ ...form, publish_at: e.target.value })} className={inp} />
          <input type="datetime-local" value={form.end_at} onChange={e => setForm({ ...form, end_at: e.target.value })} placeholder="Tự hết lúc (tuỳ chọn)" className={inp + ' col-span-2'} />
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Tiêu đề" className={inp + ' col-span-2'} />
          <input value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Nội dung" className={inp + ' col-span-2'} />
          <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="Ảnh (cho event)" className={inp + ' col-span-2'} />
          <input value={form.link_value} onChange={e => setForm({ ...form, link_value: e.target.value })} placeholder="Link (cho notify/event)" className={inp + ' col-span-2'} />
        </div>
        <button type="submit" className={btnP + ' w-full justify-center'}><Clock className="w-3.5 h-3.5" /> Hẹn giờ đăng</button>
      </form>
    </div>
  );
}

// ---- Kiểm duyệt bình luận (hàng loạt) ----
export function CommentsTab({ BASE, headers, addToast }) {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(new Set());
  const load = () => { api(BASE, headers, '/admin/comments').then(d => setList(d.comments || [])).catch(() => {}); setSel(new Set()); };
  useEffect(() => { load(); }, []); // eslint-disable-line
  const toggle = (id) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = async (method, status) => {
    if (!sel.size) return;
    const d = await api(BASE, headers, '/admin/comments', { method, body: JSON.stringify({ ids: [...sel], status }) });
    if (d.success) { addToast(`Đã xử lý ${d.count} bình luận.`, 'success'); load(); } else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2 sticky top-0 bg-[#1a1c24] py-1">
        <span className="text-[11px] text-slate-400 font-bold">{sel.size} đã chọn</span>
        <span className="flex-1" />
        <button onClick={() => bulk('PUT', 'visible')} disabled={!sel.size} className={btnG + ' disabled:opacity-40'}><Check className="w-3.5 h-3.5" /> Hiện</button>
        <button onClick={() => bulk('PUT', 'hidden')} disabled={!sel.size} className={btnG + ' disabled:opacity-40'}><Eye className="w-3.5 h-3.5" /> Ẩn</button>
        <button onClick={() => { if (confirm(`Xoá ${sel.size} bình luận?`)) bulk('DELETE'); }} disabled={!sel.size} className="px-3 py-2 bg-red-900/60 hover:bg-red-800 text-white text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Xoá</button>
      </div>
      {list.map(c => (
        <label key={c.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer ${c.status === 'hidden' ? 'bg-red-950/20 border-red-900/40' : 'bg-black/30 border-white/[0.06]'}`}>
          <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 accent-[#f36f21]" />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-bold text-[#ffb37a]">{c.name} <span className="text-slate-600 font-mono">· {c.target} · {c.created_at}</span></span>
            <span className="block text-[12px] text-slate-200 break-words">{c.body}</span>
          </span>
        </label>
      ))}
      {list.length === 0 && <p className="text-[11px] text-slate-600 italic flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Chưa có bình luận nào.</p>}
    </div>
  );
}

// ---- Dự đoán: chốt kết quả ----
export function PredictTab({ BASE, headers, addToast }) {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ event_key: '', hs: '', as: '' });
  const load = () => api(BASE, headers, '/admin/predictions').then(d => setEvents(d.events || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const settle = async (e) => {
    e.preventDefault();
    const d = await api(BASE, headers, '/admin/predictions', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast(`Đã chấm ${d.settled} dự đoán.`, 'success'); setForm({ event_key: '', hs: '', as: '' }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      {events.map(ev => (
        <button key={ev.event_key} onClick={() => setForm({ ...form, event_key: ev.event_key })} className="w-full flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] hover:border-[#f36f21]/40 px-3 py-2 text-left">
          <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="flex-1 min-w-0"><span className="block text-[12px] font-bold text-white truncate">{ev.home} vs {ev.away}</span><span className="block text-[10px] text-slate-500 font-mono">{ev.event_key} · {ev.league}</span></span>
          <span className="text-[10px] text-slate-400 shrink-0">{ev.settled}/{ev.n} đã chấm</span>
        </button>
      ))}
      {events.length === 0 && <p className="text-[11px] text-slate-600 italic">Chưa có dự đoán nào.</p>}
      <form onSubmit={settle} className="space-y-2 pt-2 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Chốt tỉ số chung cuộc</p>
        <input value={form.event_key} onChange={e => setForm({ ...form, event_key: e.target.value })} placeholder="event_key (bấm vào trận ở trên để điền)" className={inp + ' font-mono'} />
        <div className="flex gap-2">
          <input value={form.hs} onChange={e => setForm({ ...form, hs: e.target.value.replace(/\D/g, '') })} placeholder="Chủ" inputMode="numeric" className={inp + ' text-center'} />
          <input value={form.as} onChange={e => setForm({ ...form, as: e.target.value.replace(/\D/g, '') })} placeholder="Khách" inputMode="numeric" className={inp + ' text-center'} />
          <button type="submit" className={btnP}>Chấm điểm</button>
        </div>
      </form>
    </div>
  );
}

// ---- Báo cáo + xuất Excel ----
export function ReportsTab({ BASE, headers, token }) {
  const [rep, setRep] = useState(null);
  useEffect(() => { api(BASE, headers, '/admin/reports/summary').then(d => { if (d.success) setRep(d); }).catch(() => {}); }, [BASE]); // eslint-disable-line
  const dl = async (kind) => {
    try {
      const r = await fetch(`${BASE}/admin/reports/export?kind=${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chrtv-${kind}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {}
  };
  const price = (v) => { try { return Number(v || 0).toLocaleString('vi-VN') + 'đ'; } catch { return v; } };
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
          <p className="text-[18px] font-black text-white">{price(rep?.revenue?.total)}</p>
          <p className="text-[10px] text-slate-500 font-bold">Doanh thu ({rep?.revenue?.n || 0} đơn)</p>
        </div>
        <div className="rounded-2xl bg-sky-500/10 border border-sky-500/30 p-3 text-center">
          <p className="text-[18px] font-black text-white">{rep?.users || 0}</p>
          <p className="text-[10px] text-slate-500 font-bold">Người dùng</p>
        </div>
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 text-center">
          <p className="text-[18px] font-black text-white">{Number(rep?.views?.v || 0).toLocaleString()}</p>
          <p className="text-[10px] text-slate-500 font-bold">Lượt xem kênh</p>
        </div>
        <div className="rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/30 p-3 text-center">
          <p className="text-[18px] font-black text-white">{Number(rep?.xp || 0).toLocaleString()}</p>
          <p className="text-[10px] text-slate-500 font-bold">Tổng XP</p>
        </div>
      </div>
      {rep?.revByDay?.length > 0 && (
        <div className="rounded-2xl bg-black/30 border border-white/[0.06] p-3">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Doanh thu 30 ngày</p>
          {rep.revByDay.slice(0, 10).map(r => (
            <div key={r.d} className="flex items-center justify-between text-[11px] py-0.5">
              <span className="text-slate-400">{r.d}</span>
              <span className="font-bold text-white">{price(r.total)} <span className="text-slate-500">({r.n})</span></span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {['payments', 'views', 'users'].map(k => (
          <button key={k} onClick={() => dl(k)} className={btnG + ' flex-1 justify-center'}><FileSpreadsheet className="w-3.5 h-3.5" /> {k}.csv</button>
        ))}
      </div>
    </div>
  );
}


// ---- (46/20/49) Sức khoẻ kênh + báo lỗi của người xem + log lỗi player ----
export function HealthTab({ BASE, headers, addToast }) {
  const [data, setData] = useState({ channels: [], summary: null, job: null });
  const [reports, setReports] = useState({ grouped: [], reports: [] });
  const [errors, setErrors] = useState({ grouped: [] });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('bad'); // bad | all

  const load = async () => {
    const [h, r, e] = await Promise.all([
      api(BASE, headers, '/admin/channel-health'),
      api(BASE, headers, '/admin/channel-reports?status=open'),
      api(BASE, headers, '/admin/player-errors'),
    ]);
    setData({ channels: h.channels || [], summary: h.summary || null, job: h.job || null });
    setReports({ grouped: r.grouped || [], reports: r.reports || [] });
    setErrors({ grouped: e.grouped || [] });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const runCheck = async (ids) => {
    setBusy(true);
    const d = await api(BASE, headers, '/admin/channel-health', { method: 'POST', body: JSON.stringify(ids ? { channel_ids: ids } : { limit: 20 }) });
    setBusy(false);
    addToast(d.result ? `Đã kiểm tra: ${d.result}` : 'Không chạy được', d.result ? 'success' : 'error');
    load();
  };
  const closeReports = async (channel_id) => {
    await api(BASE, headers, '/admin/channel-reports', { method: 'PUT', body: JSON.stringify({ channel_id, status: 'fixed' }) });
    addToast('Đã đánh dấu đã xử lý', 'success');
    load();
  };

  const s = data.summary || {};
  const dot = (st) => st === 'up' ? 'bg-emerald-400' : st === 'flaky' ? 'bg-amber-400' : st === 'down' ? 'bg-red-500' : 'bg-slate-600';
  const list = (data.channels || []).filter(c => filter === 'all' || ['down', 'flaky'].includes(c.status));

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[['Tổng', s.channels || 0, 'text-white'], ['Tốt', s.up || 0, 'text-emerald-400'], ['Chập chờn', s.flaky || 0, 'text-amber-400'], ['Chết', s.down || 0, 'text-red-400']].map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
            <p className={`text-lg font-black ${c}`}>{v}</p>
            <p className="text-[10px] text-slate-500">{l}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => runCheck(null)} disabled={busy} className={btnP}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Kiểm tra 20 kênh ngay</button>
        <button onClick={() => setFilter(f => f === 'bad' ? 'all' : 'bad')} className={btnG}>{filter === 'bad' ? 'Xem tất cả kênh' : 'Chỉ xem kênh có vấn đề'}</button>
        <span className="text-[10px] text-slate-500">{data.job?.last_result ? `Lượt tự động gần nhất: ${data.job.last_result}` : 'Chạy nền tự động ~10 phút/lượt'}</span>
      </div>

      {reports.grouped.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5 mb-2"><Flag className="w-3.5 h-3.5 text-[#ff9a3d]" /> Người xem đang báo lỗi</p>
          <div className="space-y-1.5">
            {reports.grouped.map(g => (
              <div key={g.channel_id} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
                <span className="px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-300 text-[10px] font-black">{g.n}</span>
                <span className="text-[12px] font-bold text-white truncate flex-1">{g.channel_name || g.channel_id}</span>
                <button onClick={() => runCheck([g.channel_id])} className="text-[10px] text-slate-400 hover:text-white">Kiểm tra</button>
                <button onClick={() => closeReports(g.channel_id)} className="text-[10px] text-emerald-400 hover:text-emerald-300">Đã xử lý</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5 mb-2"><Activity className="w-3.5 h-3.5 text-emerald-400" /> Trạng thái luồng ({list.length})</p>
        {list.length === 0 && <p className="text-[11px] text-slate-600 italic">Không có kênh nào lỗi 🎉</p>}
        <div className="space-y-1">
          {list.slice(0, 200).map(c => (
            <div key={c.channel_id} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot(c.status)}`} />
              <span className="text-[12px] text-white truncate flex-1">{c.name}</span>
              <span className="text-[10px] text-slate-500 shrink-0">{c.http_code || '—'} · {c.latency_ms || 0}ms{c.fail_count ? ` · fail ${c.fail_count}` : ''}</span>
              <span className="text-[10px] text-slate-600 shrink-0">{fmtTime(c.checked_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {errors.grouped.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5 mb-2"><Bug className="w-3.5 h-3.5 text-amber-400" /> Lỗi player 3 ngày qua (từ máy người xem)</p>
          <div className="space-y-1">
            {errors.grouped.slice(0, 30).map((g, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5">
                <span className="text-[10px] font-black text-amber-300 shrink-0">{g.n}×</span>
                <span className="text-[12px] text-white truncate flex-1">{g.channel_name || g.channel_id || '(không rõ kênh)'}</span>
                {g.engine === 'js' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-black shrink-0" title="Lỗi từ chính app (render/JS), do ErrorBoundary hoặc window.onerror gửi về">APP</span>}
                <span className="text-[10px] text-slate-500 font-mono shrink-0">{g.code}</span>
                {g.sample && <span className="text-[10px] text-slate-500 font-mono truncate max-w-[42%]" title={g.sample}>{g.sample}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Nguồn phát phim ----
// App có sẵn nguồn free mặc định (VidSrc, 2Embed, VidLink, MoviesAPI, EmbedSU,
// VidCore) nên mở phim là xem được ngay. Nguồn admin thêm ở đây đứng TRƯỚC nguồn
// mặc định. Server chỉ trả nguồn có domain nằm trong allowlist (secret
// MOVIE_FRAME_SRC + domain của nguồn mặc định).
export function MovieSourcesTab({ BASE, headers, addToast }) {
  const [rows, setRows] = useState([]);
  const [allow, setAllow] = useState([]);
  const [allowSet, setAllowSet] = useState(false);
  const [customAllow, setCustomAllow] = useState([]);
  const [builtinEnabled, setBuiltinEnabled] = useState(true);
  const [builtins, setBuiltins] = useState([]);
  const [form, setForm] = useState({ name: '', kind: 'embed', url_template: '', license_note: '', sort_order: 0 });
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState(null);
  const load = () => api(BASE, headers, '/admin/movie_sources').then(d => { setRows(d.sources || []); setAllow(d.frame_allowlist || []); setAllowSet(!!d.frame_allowlist_set); setCustomAllow(d.custom_allowlist || []); setBuiltinEnabled(d.builtin_enabled !== false); setBuiltins(d.builtin_sources || []); }).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    const d = editing
      ? await api(BASE, headers, '/admin/movie_sources', { method: 'PUT', body: JSON.stringify({ ...form, id: editing }) })
      : await api(BASE, headers, '/admin/movie_sources', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast('Đã lưu nguồn.', 'success'); setEditing(null); setForm({ name: '', kind: 'embed', url_template: '', license_note: '', sort_order: 0 }); load(); }
    else addToast(d.error || 'Không lưu được', 'error');
  };
  const test = async () => {
    setTesting('…');
    const d = await api(BASE, headers, '/admin/movie_sources/test', { method: 'POST', body: JSON.stringify({ url_template: form.url_template }) });
    setTesting(d.success ? { ok: true, url: d.url } : { ok: false, error: d.error });
  };
  return (
    <div className="p-4 space-y-3">
      <div className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${allowSet ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-200' : 'border-amber-600/40 bg-amber-600/10 text-amber-200'}`}>
        <b>Nguồn free mặc định:</b> {builtinEnabled ? `BẬT — ${builtins.length || 6} server (${(builtins.map(b => b.name) || []).join(', ') || 'VidSrc, 2Embed, VidLink, MoviesAPI, EmbedSU, VidCore'})` : 'TẮT (MOVIE_BUILTIN_SOURCES=0)'}
        <div className="mt-1"><b>Domain tự khai (MOVIE_FRAME_SRC):</b> {customAllow.length ? customAllow.join(' · ') : <span className="text-slate-400">chưa khai thêm — không sao, nguồn mặc định vẫn chạy.</span>}</div>
        <div className="text-slate-400 mt-1 font-mono text-[10px]">wrangler secret put MOVIE_FRAME_SRC   # nội dung: https://domain-cua-nguồn</div>
      </div>
      {rows.map(s => (
        <div key={s.id} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
          <span className="text-[10px] font-black uppercase text-sky-300 shrink-0 w-12">{s.kind}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-bold text-white truncate">{s.name}</span>
            <span className="block text-[10px] text-slate-500 truncate font-mono">{s.url_template}</span>
            {s.license_note && <span className="block text-[10px] text-emerald-400/80 truncate">quyền: {s.license_note}</span>}
          </span>
          <span className="text-[10px] text-slate-500 shrink-0">{allow.includes((s.url_template.match(/^https:\/\/[^/]+/) || [''])[0]) ? 'OK' : 'NGOÀI ALLOWLIST'}</span>
          <button onClick={async () => { await api(BASE, headers, '/admin/movie_sources', { method: 'PUT', body: JSON.stringify({ ...s, is_active: s.is_active ? 0 : 1 }) }); load(); }} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 shrink-0">{s.is_active ? 'ĐANG BẬT' : 'ĐANG TẮT'}</button>
          <button onClick={() => { setEditing(s.id); setForm({ name: s.name, kind: s.kind, url_template: s.url_template, license_note: s.license_note || '', sort_order: s.sort_order || 0 }); }} className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 shrink-0">Sửa</button>
          <button onClick={async () => { if (!confirm('Xoá nguồn này?')) return; await api(BASE, headers, '/admin/movie_sources', { method: 'DELETE', body: JSON.stringify({ id: s.id }) }); load(); }} className="text-slate-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <form onSubmit={save} className="space-y-2 pt-2 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{editing ? `Sửa nguồn #${editing}` : 'Thêm nguồn mới'}</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tên hiển thị (vd: Partner X)" className={inp} />
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={inp}>
            <option value="embed">embed — nhúng iframe player</option>
            <option value="hls">hls — link .m3u8, app tự phát</option>
          </select>
          <input value={form.url_template} onChange={e => setForm({ ...form, url_template: e.target.value })} placeholder="https://player.partner.vn/movie/{tmdb}  ({{tmdb}} {{type}} {{season}} {{episode}})" className={inp + ' col-span-2 font-mono'} />
          <input value={form.license_note} onChange={e => setForm({ ...form, license_note: e.target.value })} placeholder="Nguồn này có bản quyền từ đâu? (bắt buộc)" className={inp + ' col-span-2'} />
          <input value={form.sort_order} type="number" onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder="Thứ tự" className={inp} />
          <button type="button" onClick={test} className={btnG + ' justify-center'}>Test URL {testing && <span className="ml-1 text-[10px]">{typeof testing === 'string' ? testing : testing.ok ? '→ hợp lệ' : ''}</span>}</button>
        </div>
        {typeof testing === 'object' && (
          <p className={`text-[10px] ${testing.ok ? 'text-emerald-400' : 'text-red-400'} break-all`}>{testing.ok ? `URL khi gửi lên player: ${testing.url}` : testing.error}</p>
        )}
        <div className="flex gap-2">
          <button type="submit" className={btnP + ' flex-1 justify-center'}>{editing ? 'Cập nhật' : 'Thêm'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', kind: 'embed', url_template: '', license_note: '', sort_order: 0 }); }} className={btnG}>Huỷ</button>}
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Chỉ thêm nguồn bạn CÓ QUYỀN phân phối. Tên nguồn và url_template được ghi vào audit_log khi lưu.
        </p>
      </form>
    </div>
  );
}


// ---- Chủ đề trang trí (site_themes) — FIFA ASEAN Cup v.v. ----
export function ThemesTab({ BASE, headers, addToast }) {
  const [themes, setThemes] = useState([]);
  const [form, setForm] = useState({
    key: '', name: '', emoji: '🏆', description: '',
    primary_color: '#0e7a3a', secondary_color: '#0b1d12', accent_color: '#ffd700',
    background_url: '', banner_url: '', logo_url: '', confetti: 'trophy', css: '',
    is_active: 1, starts_at: '', ends_at: '', sort_order: 0,
  });
  const [editing, setEditing] = useState(null);
  const load = () => api(BASE, headers, '/admin/themes').then(d => setThemes(d.themes || [])).catch(()=>{});
  useEffect(()=>{ load(); }, []);
  const reset = () => {
    setForm({ key: '', name: '', emoji: '🏆', description: '', primary_color: '#0e7a3a', secondary_color: '#0b1d12', accent_color: '#ffd700', background_url: '', banner_url: '', logo_url: '', confetti: 'trophy', css: '', is_active: 1, starts_at: '', ends_at: '', sort_order: 0 });
    setEditing(null);
  };
  const applyPreset = (p) => {
    setForm(f => ({ ...f, key: p.key, name: p.name, emoji: p.emoji || '🏆', description: p.description || '', primary_color: p.primary_color || '#f36f21', secondary_color: p.secondary_color || '#1a1c24', accent_color: p.accent_color || '#ffb37a', confetti: p.confetti || 'none' }));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.key || !form.name) { addToast('Thiếu key/tên', 'error'); return; }
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { id: editing, ...form } : form;
    const d = await api(BASE, headers, '/admin/themes', { method, body: JSON.stringify(body) });
    if (d.success) { addToast(editing ? 'Đã cập nhật chủ đề' : `Đã tạo ${d.key}`, 'success'); reset(); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  const startEdit = (t) => {
    setEditing(t.id);
    setForm({
      key: t.key, name: t.name, emoji: t.emoji || '', description: t.description || '',
      primary_color: t.primary_color || '#f36f21', secondary_color: t.secondary_color || '#1a1c24', accent_color: t.accent_color || '#ffb37a',
      background_url: t.background_url || '', banner_url: t.banner_url || '', logo_url: t.logo_url || '',
      confetti: t.confetti || 'none', css: t.css || '', is_active: t.is_active ?? 1,
      starts_at: t.starts_at || '', ends_at: t.ends_at || '', sort_order: t.sort_order || 0,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleActive = async (t) => {
    const d = await api(BASE, headers, '/admin/themes', { method: 'PUT', body: JSON.stringify({ id: t.id, is_active: t.is_active ? 0 : 1 }) });
    if (d.success) { addToast(t.is_active ? 'Đã tắt chủ đề' : 'Đã bật — sẽ hiện toàn site!', 'success'); load(); }
  };
  const del = async (id) => {
    if (!confirm('Xoá chủ đề này?')) return;
    const d = await api(BASE, headers, '/admin/themes', { method: 'DELETE', body: JSON.stringify({ id }) });
    if (d.success) { addToast('Đã xoá', 'success'); load(); } else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-[#0e7a3a]/20 to-[#ffd700]/10 border border-[#0e7a3a]/30 p-3">
        <p className="text-[12px] font-black text-white flex items-center gap-1.5"><Palette className="w-4 h-4 text-[#ffd700]" /> Trang trí theo chủ đề</p>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">Tạo chủ đề sự kiện (VD: FIFA ASEAN Cup 2026) — chọn màu, emoji, banner, hiệu ứng confetti, thời gian. Bật <b>is_active</b> → toàn bộ web tự đổi màu + banner + hiệu ứng. Chỉ 1 chủ đề active đầu (sort_order nhỏ nhất) được áp dụng.</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {THEME_PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p)} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center gap-1">
              <span>{p.emoji}</span> {p.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-2 rounded-xl bg-black/30 border border-white/[0.06] p-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{editing ? `Sửa #${editing}` : 'Tạo chủ đề mới'}</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.key} onChange={e => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') })} placeholder="key (vd: fifa-asean-cup-2026)" className={inp + ' font-mono'} />
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tên hiển thị (FIFA ASEAN Cup 2026)" className={inp} />
          <input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} placeholder="Emoji 🏆" className={inp} />
          <select value={form.confetti} onChange={e => setForm({ ...form, confetti: e.target.value })} className={inp}>
            <option value="none">Không confetti</option>
            <option value="trophy">🏆 Cúp + bóng</option>
            <option value="fireworks">🎆 Pháo hoa</option>
            <option value="snow">❄️ Tuyết rơi</option>
            <option value="ball">⚽ Bóng đá</option>
            <option value="pumpkin">🎃 Halloween</option>
          </select>
          <input value={form.primary_color} onChange={e => setForm({ ...form, primary_color: e.target.value })} placeholder="#0e7a3a primary" className={inp + ' font-mono'} />
          <input value={form.secondary_color} onChange={e => setForm({ ...form, secondary_color: e.target.value })} placeholder="#0b1d12 secondary" className={inp + ' font-mono'} />
          <input value={form.accent_color} onChange={e => setForm({ ...form, accent_color: e.target.value })} placeholder="#ffd700 accent" className={inp + ' font-mono'} />
          <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder="Thứ tự (0 = ưu tiên)" className={inp} />
        </div>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mô tả ngắn (hiện ở banner)" className={inp} />
        <input value={form.banner_url} onChange={e => setForm({ ...form, banner_url: e.target.value })} placeholder="Banner URL (https://...)" className={inp} />
        <input value={form.background_url} onChange={e => setForm({ ...form, background_url: e.target.value })} placeholder="Background URL (ảnh nền mờ toàn site, optional)" className={inp} />
        <input value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="Logo override URL (optional, đè logo header khi theme active)" className={inp} />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} placeholder="Bắt đầu YYYY-MM-DD HH:MM:SS (trống = luôn)" className={inp + ' font-mono text-[11px]'} />
          <input value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} placeholder="Kết thúc YYYY-MM-DD HH:MM:SS" className={inp + ' font-mono text-[11px]'} />
        </div>
        <textarea value={form.css} onChange={e => setForm({ ...form, css: e.target.value })} placeholder="Custom CSS (optional, VD: .topnav { border-color: var(--theme-accent)!important }) — tối đa 4000 ký tự" className={inp + ' min-h-[70px] font-mono text-[11px]'} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer"><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Kích hoạt ngay</label>
          <span className="flex-1" />
          {editing && <button type="button" onClick={reset} className={btnG}>Huỷ sửa</button>}
          <button type="submit" className={btnP}><Sparkles className="w-3.5 h-3.5" /> {editing ? 'Lưu' : 'Tạo chủ đề'}</button>
        </div>
        {form.primary_color && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-slate-500">Preview:</span>
            <span className="w-5 h-5 rounded-full border border-white/20" style={{ background: form.primary_color }} />
            <span className="w-5 h-5 rounded-full border border-white/20" style={{ background: form.secondary_color }} />
            <span className="w-5 h-5 rounded-full border border-white/20" style={{ background: form.accent_color }} />
            <span className="text-[11px]">{form.emoji} {form.name || 'Tên chủ đề'}</span>
          </div>
        )}
      </form>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Danh sách ({themes.length})</p>
        {themes.length === 0 && <p className="text-[11px] text-slate-600 italic">Chưa có chủ đề nào — bấm preset FIFA ASEAN Cup 2026 ở trên để tạo nhanh.</p>}
        {themes.map(t => (
          <div key={t.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${t.is_active ? 'bg-[#0e7a3a]/15 border-[#0e7a3a]/30' : 'bg-black/30 border-white/[0.06]'}`}>
            <span className="text-[14px]">{t.emoji || '🎨'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate">{t.name} <span className="font-mono text-[10px] text-slate-500">({t.key})</span></p>
              <p className="text-[10px] text-slate-400 truncate">{t.description || ''} {t.starts_at ? `· từ ${t.starts_at}` : ''} {t.ends_at ? `→ ${t.ends_at}` : ''}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: t.primary_color }} />
              <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: t.accent_color }} />
            </div>
            <button onClick={() => toggleActive(t)} className={`text-[10px] font-black px-2 py-1 rounded-full ${t.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>{t.is_active ? 'Đang bật' : 'Tắt'}</button>
            <button onClick={() => startEdit(t)} className="text-[11px] text-slate-400 hover:text-white px-1.5">Sửa</button>
            <button onClick={() => del(t.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}


export const EXTRA_TABS = [
  { id: 'health', label: 'Sức khoẻ kênh', icon: Activity },
  { id: 'live', label: 'Trực tiếp', icon: Eye },
  { id: 'gifts', label: 'Gift code', icon: Gift },
  { id: 'payments', label: 'Thanh toán', icon: CreditCard },
  { id: 'ads', label: 'Quảng cáo', icon: Megaphone },
  { id: 'moviesrc', label: 'Nguồn phim', icon: Film },
  { id: 'sched', label: 'Lịch đăng', icon: Clock },
  { id: 'comments', label: 'Bình luận', icon: MessageCircle },
  { id: 'predict', label: 'Dự đoán', icon: Target },
  { id: 'reports', label: 'Báo cáo', icon: FileSpreadsheet },
  // ---- Đợt 48 ----
  { id: 'rt48', label: 'Realtime', icon: Radio },
  { id: 'alerts48', label: 'Cảnh báo', icon: ShieldAlert },
  { id: 'regions48', label: 'Vùng chặn', icon: MapPin },
  { id: 'maint48', label: 'Bảo trì kênh', icon: Flag },
  { id: 'chal48', label: 'Challenge', icon: Target },
  { id: 'aff48', label: 'Affiliate', icon: HandCoins },
  { id: 'wmlayer', label: 'Logo khi phát', icon: Image },
  { id: 'themes', label: 'Chủ đề trang trí', icon: Palette },
];

// ============================================================================
// ĐỢT 48 — tab admin mới: realtime, cảnh báo in-dash, vùng chặn, bảo trì,
// challenge hashtag, affiliate (vé rạp/sách), lịch đăng có preview.
// ============================================================================
function MiniStat({ label, value, color }) {
  return (
    <div className="rounded-xl bg-black/30 border border-white/[0.07] px-3 py-2.5">
      <p className={`text-lg font-black ${color || 'text-white'}`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

// (#53) Dashboard realtime: ai đang xem + kênh hot + lỗi + kênh chết
export function RealtimeTab({ BASE, headers }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => api(BASE, headers, '/admin/realtime').then((d) => { if (on && d.success) setData(d); }).catch(() => {});
    load();
    const iv = setInterval(load, 8000);
    return () => { on = false; clearInterval(iv); };
  }, [BASE]);
  const bk = data?.by_kind || {};
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Đang xem" value={data ? (data.online || 0) : '…'} color="text-emerald-400" />
        <MiniStat label="Báo lỗi mở" value={data ? (data.open_reports || 0) : '…'} color={data?.open_reports ? 'text-amber-400' : 'text-slate-300'} />
        <MiniStat label="Kênh chết" value={data ? (data.down_list || []).length : '…'} color={(data?.down_list || []).length ? 'text-red-400' : 'text-slate-300'} />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        {Object.entries(bk).map(([k, v]) => <span key={k} className="px-2 py-1 rounded-full bg-white/[0.06] text-slate-300">{k === 'movie' ? '🎬' : k === 'short' ? '▶️' : k === 'sport' ? '⚽' : '📺'} {k}: {v}</span>)}
        {!Object.keys(bk).length && <span className="text-slate-600 italic px-1">Chưa có ai online — mở app xem kênh ~1 phút là hiện.</span>}
      </div>
      {data?.presence?.length > 0 && (
        <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Đang phát (presence)</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {data.presence.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-bold text-slate-200 truncate max-w-[160px]">{v.name || 'Khách'}</span>
                <span className="text-slate-500 truncate">{v.ref_name || v.ref_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.hot?.length > 0 && (
        <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">🔥 Kênh hot 15 phút</p>
          {data.hot.map((h, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
              <b className="w-4 text-[#ff9a3d]">{i + 1}</b><span className="text-slate-200 truncate">{h.name}</span>
              <span className="text-slate-600 shrink-0">{h.views || 0} lượt · {Math.round((h.seconds || 0) / 60)}′</span>
            </div>
          ))}
        </div>
      )}
      {data?.errors?.length > 0 && (
        <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">⚠️ Lỗi player 2h gần nhất</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {data.errors.map((e, i) => (
              <div key={i} className="text-[10px] text-slate-400 flex gap-2"><span className="text-slate-600 shrink-0">{String(e.created_at || '').slice(11, 16)}</span><b className="text-slate-300 truncate">{e.channel_name}</b><span className="truncate">{e.code || e.detail}</span></div>
            ))}
          </div>
        </div>
      )}
      {data?.down_list?.length > 0 && (
        <div className="rounded-xl bg-red-950/30 border border-red-500/20 p-3">
          <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1.5">Kênh đang lỗi</p>
          <div className="flex flex-wrap gap-1.5">{data.down_list.map((n, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 text-[10px] font-bold">{n}</span>)}</div>
        </div>
      )}
    </div>
  );
}

// (#57) Cảnh báo IN-DASH (không Telegram): rules + feed + ack, chạy qua runDueJobs
export function AlertsTab({ BASE, headers, addToast }) {
  const [rules, setRules] = useState([]);
  const [feed, setFeed] = useState([]);
  const [form, setForm] = useState({ name: '', metric: 'channels_down', op: 'gt', threshold: 2, cooldown_s: 3600 });
  const [note, setNote] = useState('');
  const METRICS = [
    ['channels_down', 'Số kênh chết'],
    ['player_errors_1h', 'Lỗi player 1 giờ'],
    ['viewers_online', 'Người đang xem'],
    ['open_reports', 'Báo lỗi chưa xử lý'],
  ];
  const load = () => {
    api(BASE, headers, '/admin/alerts/rules').then((d) => setRules(d.rules || [])).catch(() => {});
    api(BASE, headers, '/admin/alerts/feed').then((d) => setFeed(d.feed || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    const d = await api(BASE, headers, '/admin/alerts/rules', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast('Đã thêm rule cảnh báo', 'success'); setForm({ name: '', metric: 'channels_down', op: 'gt', threshold: 2, cooldown_s: 3600 }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-amber-400" />Cảnh báo trong dashboard — mỗi request GET tự chạy đánh giá rule (không cần cron)</p>
        <button onClick={async () => { const d = await api(BASE, headers, '/admin/alerts/test', { method: 'POST', body: '{}' }); addToast(d.message || 'Đã chạy', 'success'); load(); }} className={btnG + ' shrink-0'}><RefreshCw className="w-3.5 h-3.5" /> Chạy kiểm tra</button>
      </div>
      {/* Feed */}
      <div className="rounded-xl bg-black/30 border border-white/[0.07] p-3">
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Feed ({feed.filter((f) => !f.ack).length} chưa xử lý)</p>
        {feed.length === 0 && <p className="text-[11px] text-slate-600 italic">Chưa có cảnh báo nào.</p>}
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {feed.map((f) => (
            <div key={f.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border text-[11px] ${f.ack ? 'opacity-50 border-white/[0.05] bg-black/20' : f.level === 'critical' ? 'border-red-500/40 bg-red-950/30' : 'border-amber-500/30 bg-amber-950/20'}`}>
              <span>{f.level === 'critical' ? '🔴' : '⚠️'}</span>
              <span className="flex-1 text-slate-200">{f.message}</span>
              <span className="text-[9px] text-slate-500 shrink-0">{String(f.created_at || '').slice(0, 16).replace('T', ' ')}</span>
              {!f.ack && <button onClick={async () => { await api(BASE, headers, '/admin/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: [f.id] }) }); load(); }} className="px-2 py-0.5 rounded-md bg-emerald-600/30 text-emerald-300 text-[10px] font-bold">Xong ✓</button>}
            </div>
          ))}
        </div>
      </div>
      {/* Manual push */}
      <div className="flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cảnh báo tay (vd: kênh VTV3 đang lỗi theo báo cáo)" className={inp} />
        <button onClick={async () => { if (!note.trim()) return; const d = await api(BASE, headers, '/admin/alerts/push', { method: 'POST', body: JSON.stringify({ message: note.trim(), level: 'warn' }) }); if (d.success) { setNote(''); load(); } }} className={btnP + ' shrink-0'}>Đẩy cảnh báo</button>
      </div>
      {/* Rules */}
      <div className="rounded-xl bg-black/30 border border-white/[0.07] p-3">
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Rules</p>
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-white/[0.04] last:border-0">
            <span className={`w-2 h-2 rounded-full ${r.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <b className="text-slate-200">{r.name}</b>
            <span className="text-slate-500">{METRICS.find((m) => m[0] === r.metric)?.[1] || r.metric} {r.op === 'lt' ? '<' : '>'} {r.threshold}</span>
            <span className="text-slate-600">· cooldown {(r.cooldown_s || 3600) / 60}′</span>
            <span className="flex-1" />
            <button onClick={async () => { await api(BASE, headers, '/admin/alerts/rules', { method: 'PUT', body: JSON.stringify({ id: r.id, enabled: r.enabled ? 0 : 1 }) }); load(); }} className="text-[10px] font-bold text-slate-400 hover:text-white px-1.5">{r.enabled ? 'Tắt' : 'Bật'}</button>
            <button onClick={async () => { if (!confirm('Xoá rule?')) return; await api(BASE, headers, '/admin/alerts/rules', { method: 'DELETE', body: JSON.stringify({ id: r.id }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <form onSubmit={save} className="grid grid-cols-6 gap-2 pt-2">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên rule" className={inp + ' col-span-6'} />
          <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} className={inp + ' col-span-3'}>
            {METRICS.map((m) => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
          </select>
          <select value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })} className={inp}>
            <option value="gt">&gt;</option><option value="lt">&lt;</option>
          </select>
          <input type="number" step="any" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className={inp} />
          <input type="number" min="60" value={form.cooldown_s} onChange={(e) => setForm({ ...form, cooldown_s: e.target.value })} title="Cooldown (giây)" className={inp} />
          <button type="submit" className={btnP + ' col-span-6 justify-center'}><Plus className="w-3.5 h-3.5" /> Thêm rule</button>
        </form>
      </div>
    </div>
  );
}

// (B) Vùng quốc gia blocklist cho channels/events/ads/movie_sources
export function RegionsTab({ BASE, headers, addToast }) {
  const [type, setType] = useState('channel');
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null); // {channel_id|id, regions}
  const [regions, setRegions] = useState('');
  const load = () => api(BASE, headers, `/admin/regions?type=${type}`).then((d) => setItems(d.items || [])).catch(() => {});
  useEffect(() => { load(); }, [type]); // eslint-disable-line
  const TYPES = [['channel', '📺 Kênh'], ['event', '🎪 Sự kiện/banner'], ['ad', '📢 Quảng cáo'], ['movie_source', '🎬 Nguồn phim']];
  return (
    <div className="p-4 space-y-2">
      <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-red-400" />Chặn cứng theo quốc gia — rỗng = phát toàn cầu. Nhập mã quốc gia cách nhau dấu phẩy: <code className="text-red-300">DE, US</code>. Xem thử UI theo vùng: mở web kèm <code className="text-red-300">?viewCountry=DE</code> (admin).</p>
      <div className="flex flex-wrap gap-1.5">{TYPES.map(([v, l]) => <button key={v} onClick={() => { setType(v); setEdit(null); }} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${type === v ? 'grad-brand text-white' : 'bg-white/[0.05] text-slate-400 hover:text-white'}`}>{l}</button>)}</div>
      <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
        {items.map((it) => {
          const idKey = it.channel_id !== undefined ? it.channel_id : it.id;
          const name = it.name || it.title || String(it.channel_id);
          const isEdit = edit === idKey;
          return (
            <div key={String(idKey)} className="flex items-center gap-2 rounded-lg bg-black/25 border border-white/[0.06] px-2.5 py-1.5">
              <span className="text-[11px] text-slate-300 truncate flex-1">{name}</span>
              {isEdit ? (
                <>
                  <input value={regions} onChange={(e) => setRegions(e.target.value.toUpperCase())} placeholder="VD: DE, US (trống = toàn cầu)" className={inp + ' w-52'} />
                  <button onClick={async () => {
                    await api(BASE, headers, '/admin/regions', { method: 'PUT', body: JSON.stringify({ type, ...(it.channel_id !== undefined ? { channel_id: it.channel_id } : { id: it.id }), regions }) });
                    addToast('Đã lưu vùng chặn', 'success'); setEdit(null); load();
                  }} className={btnP + ' shrink-0'}><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEdit(null)} className="px-2 py-1 text-slate-500"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  {it.blocked_regions ? <span className="text-[10px] font-bold text-red-300">🚫 {it.blocked_regions}</span> : <span className="text-[10px] text-emerald-400/80">🌍 toàn cầu</span>}
                  <button onClick={() => { setEdit(idKey); setRegions(it.blocked_regions || ''); }} className="text-[10px] font-bold text-slate-400 hover:text-white px-1.5">Sửa</button>
                </>
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="text-[11px] text-slate-600 italic">Chưa có mục nào.</p>}
      </div>
    </div>
  );
}

// (#54) Biển bảo trì kênh + gợi ý kênh thay thế cùng nhóm
export function MaintenanceTab({ BASE, headers, addToast }) {
  const [channels, setChannels] = useState([]);
  const [cur, setCur] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState('');
  const [list, setList] = useState([]);
  const [alts, setAlts] = useState([]);
  const load = () => api(BASE, headers, '/admin/maintenance').then((d) => setList(d.items || [])).catch(() => {});
  useEffect(() => {
    api(BASE, headers, '/api/channels').then((d) => setChannels(d.channels || [])).catch(() => {});
    load();
  }, []); // eslint-disable-line
  const pickChannel = (ch) => {
    setCur(ch.channel_id);
    setAlts(channels.filter((c) => c.group_title === ch.group_title && c.channel_id !== ch.channel_id).slice(0, 5));
  };
  return (
    <div className="p-4 space-y-2">
      <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5"><Flag className="w-3.5 h-3.5 text-red-400" />Kênh bảo trì sẽ hiện biển "Đang bảo trì đến HH:MM" + gợi ý kênh thay thế cùng nhóm cho người xem. Hết giờ tự hết (không cần cron — đối chiếu khi xin token phát).</p>
      <div className="grid grid-cols-3 gap-2">
        <select value={cur} onChange={(e) => pickChannel(channels.find((c) => c.channel_id === e.target.value) || { channel_id: e.target.value, group_title: '' })} className={inp + ' col-span-3'}>
          <option value="">— Chọn kênh cần bảo trì —</option>
          {channels.map((c) => <option key={c.channel_id} value={c.channel_id}>{c.name} · {c.group_title}</option>)}
        </select>
        <input type="number" min="1" max="10080" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inp} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do (hiện cho người xem)" className={inp + ' col-span-2'} />
        <button onClick={async () => {
          if (!cur) return addToast('Chọn kênh trước', 'error');
          const d = await api(BASE, headers, '/admin/maintenance', { method: 'POST', body: JSON.stringify({ channel_id: cur, minutes: Number(minutes) || 30, note }) });
          if (d.success) { addToast(`Bảo trì ${cur} trong ${minutes}′`, 'success'); setCur(''); setNote(''); setAlts([]); load(); }
          else addToast(d.error || 'Lỗi', 'error');
        }} className={btnP + ' col-span-3 justify-center'}><Flag className="w-3.5 h-3.5" /> Đặt bảo trì</button>
      </div>
      {alts.length > 0 && <p className="text-[10px] text-slate-500">Gợi ý thay thế sẽ hiện: {alts.map((a) => a.name).join(', ')}</p>}
      <div className="space-y-1.5">
        {list.map((it) => (
          <div key={it.channel_id} className="flex items-center gap-2 rounded-lg bg-red-950/20 border border-red-500/20 px-2.5 py-1.5 text-[11px]">
            <span className="text-red-300">🔧</span><b className="text-slate-200">{it.name}</b>
            <span className="text-slate-500">đến {new Date(it.maintenance_until * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
            {it.note && <span className="text-slate-500 truncate">· {it.note}</span>}
            <span className="flex-1" />
            <button onClick={async () => { await api(BASE, headers, '/admin/maintenance', { method: 'DELETE', body: JSON.stringify({ channel_id: it.channel_id }) }); load(); }} className="text-slate-500 hover:text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {list.length === 0 && <p className="text-[11px] text-slate-600 italic">Không kênh nào đang bảo trì.</p>}
      </div>
    </div>
  );
}

// (#40) Challenge hashtag tuần
export function ChallengesTab({ BASE, headers, addToast }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: '', hashtag: '', description: '', starts_at: '', ends_at: '' });
  const load = () => api(BASE, headers, '/admin/challenges').then((d) => setList(d.challenges || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    if (!form.title || !form.hashtag) return addToast('Cần title + hashtag', 'error');
    const d = await api(BASE, headers, '/admin/challenges', { method: 'POST', body: JSON.stringify({ ...form, starts_at: form.starts_at ? form.starts_at.replace('T', ' ') : '', ends_at: form.ends_at ? form.ends_at.replace('T', ' ') : '' }) });
    if (d.success) { addToast('Đã tạo challenge', 'success'); setForm({ title: '', hashtag: '', description: '', starts_at: '', ends_at: '' }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      {list.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-xl bg-black/25 border border-white/[0.06] px-3 py-2 text-[11px]">
          <span className="text-base">{c.is_active ? '🏆' : '⏸️'}</span>
          <div className="flex-1 min-w-0"><b className="text-slate-200">{c.title}</b> <span className="text-[#ff9a3d] font-mono">#{c.hashtag}</span><p className="text-slate-500 truncate">{c.description || ''}</p></div>
          <span className="text-slate-500 shrink-0">{c.starts_at?.slice(5, 10) || '…'} → {c.ends_at?.slice(5, 10) || '∞'}</span>
          <button onClick={async () => { await api(BASE, headers, '/admin/challenges', { method: 'PUT', body: JSON.stringify({ id: c.id, is_active: c.is_active ? 0 : 1 }) }); load(); }} className="text-slate-400 hover:text-white px-1.5">{c.is_active ? 'Tắt' : 'Bật'}</button>
          <button onClick={async () => { if (!confirm('Xoá challenge?')) return; await api(BASE, headers, '/admin/challenges', { method: 'DELETE', body: JSON.stringify({ id: c.id }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <form onSubmit={save} className="grid grid-cols-2 gap-2 pt-1">
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tên thử thách (tuần 1: #bongda)" className={inp} />
        <input required value={form.hashtag} onChange={(e) => setForm({ ...form, hashtag: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="hashtag (không #)" className={inp + ' font-mono'} />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả ngắn" className={inp + ' col-span-2'} />
        <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={inp} />
        <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className={inp} />
        <button type="submit" className={btnP + ' col-span-2 justify-center'}><Plus className="w-3.5 h-3.5" /> Tạo challenge</button>
      </form>
    </div>
  );
}

// (#85) Link affiliate (vé rạp / sách)
export function AffiliatesTab({ BASE, headers, addToast }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', kind: 'cinema', url_template: '', label: '' });
  const load = () => api(BASE, headers, '/admin/affiliates').then((d) => setList(d.affiliates || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    const d = await api(BASE, headers, '/admin/affiliates', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast('Đã thêm affiliate', 'success'); setForm({ name: '', kind: 'cinema', url_template: '', label: '' }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      <p className="text-[11px] text-slate-400">Link affiliate hiện cạnh phim (vé rạp 🎟 / sách 📚). Dùng <code className="text-slate-300">{'{title}'}</code> để chèn tên phim.</p>
      {list.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-xl bg-black/25 border border-white/[0.06] px-3 py-2 text-[11px]">
          <span>{a.kind === 'book' ? '📚' : '🎟️'}</span><b className="text-slate-200">{a.name}</b><span className="text-slate-500 truncate flex-1">{a.url_template}</span>
          <button onClick={async () => { await api(BASE, headers, '/admin/affiliates', { method: 'PUT', body: JSON.stringify({ id: a.id, enabled: a.enabled ? 0 : 1 }) }); load(); }} className="text-slate-400 hover:text-white px-1.5">{a.enabled ? 'Bật' : 'Tắt'}</button>
          <button onClick={async () => { if (!confirm('Xoá?')) return; await api(BASE, headers, '/admin/affiliates', { method: 'DELETE', body: JSON.stringify({ id: a.id }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <form onSubmit={save} className="grid grid-cols-2 gap-2 pt-1">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên (VD: CGV, Galaxy)" className={inp} />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inp}>
          <option value="cinema">🎟️ Vé rạp</option><option value="book">📚 Sách</option>
        </select>
        <input required value={form.url_template} onChange={(e) => setForm({ ...form, url_template: e.target.value })} placeholder="https://…/?q={title}" className={inp + ' col-span-2 font-mono'} />
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Nhãn nút (VD: Mua vé)" className={inp + ' col-span-2'} />
        <button type="submit" className={btnP + ' col-span-2 justify-center'}><Plus className="w-3.5 h-3.5" /> Thêm</button>
      </form>
    </div>
  );
}
