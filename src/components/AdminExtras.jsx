import React, { useState, useEffect } from 'react';
import { Eye, Gift, CreditCard, Megaphone, Clock, MessageCircle, Target, FileSpreadsheet, Trash2, Check, X, Plus } from 'lucide-react';

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
  const [form, setForm] = useState({ code: '', plan: 'vip', days: 30, max_uses: 1, note: '' });
  const load = () => api(BASE, headers, '/admin/gifts').then(d => setGifts(d.gifts || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const create = async (e) => {
    e.preventDefault();
    const d = await api(BASE, headers, '/admin/gifts', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast(`Đã tạo mã: ${d.code}`, 'success'); setForm({ code: '', plan: 'vip', days: 30, max_uses: 1, note: '' }); load(); }
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
          <option value="vip">VIP</option><option value="recreational">Recreational</option><option value="standard">Standard</option>
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
const SLOTS = ['home', 'movies', 'sports', 'community', 'banner'];
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
          <select value={form.slot} onChange={e => setForm({ ...form, slot: e.target.value })} className={inp}>{SLOTS.map(s => <option key={s} value={s}>{s}</option>)}</select>
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
  const [form, setForm] = useState({ kind: 'broadcast', title: '', body: '', link_value: '', publish_at: '' });
  const load = () => api(BASE, headers, '/admin/scheduled').then(d => setPosts(d.posts || [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault();
    if (!form.publish_at || !form.body) { addToast('Cần nội dung + giờ đăng', 'error'); return; }
    const d = await api(BASE, headers, '/admin/scheduled', { method: 'POST', body: JSON.stringify(form) });
    if (d.success) { addToast('Đã hẹn giờ đăng.', 'success'); setForm({ kind: 'broadcast', title: '', body: '', link_value: '', publish_at: '' }); load(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  return (
    <div className="p-4 space-y-2">
      <p className="text-[10px] text-slate-500">Tới giờ hệ thống tự đẩy ra app (không cần cron).</p>
      {posts.map(p => (
        <div key={p.id} className="flex items-center gap-2 rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
          <span className={`text-[10px] font-black uppercase shrink-0 ${p.is_done ? 'text-emerald-400' : 'text-amber-300'}`}>{p.is_done ? '✓' : '⏳'} {p.kind}</span>
          <span className="flex-1 min-w-0"><span className="block text-[12px] font-bold text-white truncate">{p.title || p.body}</span><span className="block text-[10px] text-slate-500">{p.publish_at}</span></span>
          <button onClick={async () => { if (!confirm('Xoá lịch này?')) return; await api(BASE, headers, '/admin/scheduled', { method: 'DELETE', body: JSON.stringify({ id: p.id }) }); load(); }} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <form onSubmit={save} className="space-y-2 pt-2 border-t border-slate-800/40">
        <div className="grid grid-cols-2 gap-2">
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={inp}>
            <option value="broadcast">Banner chạy chữ</option><option value="notify">Thông báo</option><option value="event">Sự kiện home</option>
          </select>
          <input type="datetime-local" value={form.publish_at} onChange={e => setForm({ ...form, publish_at: e.target.value })} className={inp} />
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Tiêu đề" className={inp + ' col-span-2'} />
          <input value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Nội dung" className={inp + ' col-span-2'} />
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

export const EXTRA_TABS = [
  { id: 'live', label: 'Trực tiếp', icon: Eye },
  { id: 'gifts', label: 'Gift code', icon: Gift },
  { id: 'payments', label: 'Thanh toán', icon: CreditCard },
  { id: 'ads', label: 'Quảng cáo', icon: Megaphone },
  { id: 'sched', label: 'Lịch đăng', icon: Clock },
  { id: 'comments', label: 'Bình luận', icon: MessageCircle },
  { id: 'predict', label: 'Dự đoán', icon: Target },
  { id: 'reports', label: 'Báo cáo', icon: FileSpreadsheet },
];
