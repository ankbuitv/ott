import React, { useState, useEffect } from 'react';
import { Settings, Users, BarChart3, Bell, Radio, Send, Eye, TrendingUp, Calendar, Plus, Trash2, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const BASE = window.location.origin;

// --- Helpers: XMLTV timestamp <-> datetime-local ---
function xmltvToLocal(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5], +m[6])); // UTC+7
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localToXmltv(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())} +0700`;
}

export default function AdminPanel({ onClose }) {
  const { token, user } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);

  // Notification form
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyType, setNotifyType] = useState('info');
  const [notifyChannel, setNotifyChannel] = useState('');

  // Broadcast form
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastType, setBroadcastType] = useState('info');

  // EPG override
  const [allChannels, setAllChannels] = useState([]);
  const [epgSelChannel, setEpgSelChannel] = useState('');
  const [realEpg, setRealEpg] = useState([]);        // real programmes for selected channel
  const [overrideProgs, setOverrideProgs] = useState([]); // custom programmes (editable)
  const [epgOverridesList, setEpgOverridesList] = useState([]);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [progForm, setProgForm] = useState({ title: '', start: '', stop: '', desc: '' });

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/admin/stats`, { headers }).then(r => r.json()).then(d => d.stats && setStats(d.stats)).catch(() => {});
    fetch(`${BASE}/admin/analytics`, { headers }).then(r => r.json()).then(d => setAnalytics(d.analytics || [])).catch(() => {});
    fetch(`${BASE}/admin/notifications`, { headers }).then(r => r.json()).then(d => setNotifications(d.notifications || [])).catch(() => {});
    fetch(`${BASE}/admin/broadcasts`, { headers }).then(r => r.json()).then(d => setBroadcasts(d.broadcasts || [])).catch(() => {});
    // EPG data
    fetch(`${BASE}/api/channels`).then(r => r.json()).then(d => setAllChannels(d.channels || [])).catch(() => {});
    fetch(`${BASE}/admin/epg-overrides`, { headers }).then(r => r.json()).then(d => setEpgOverridesList(d.overrides || [])).catch(() => {});
  }, [token]);

  const sendNotification = async (e) => {
    e.preventDefault();
    const r = await fetch(`${BASE}/admin/notify`, { method: 'POST', headers, body: JSON.stringify({ title: notifyTitle, body: notifyBody, type: notifyType, channel_id: notifyChannel }) });
    const d = await r.json();
    if (d.success) { addToast('Đã gửi thông báo!', 'success'); setNotifyTitle(''); setNotifyBody(''); }
    else addToast(d.error, 'error');
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    const r = await fetch(`${BASE}/admin/broadcast`, { method: 'POST', headers, body: JSON.stringify({ message: broadcastMsg, type: broadcastType, expires_in: 3600 }) });
    const d = await r.json();
    if (d.success) { addToast('Đã broadcast!', 'success'); setBroadcastMsg(''); }
    else addToast(d.error, 'error');
  };

  // ---------- EPG override handlers ----------
  const loadEpgForChannel = async (chId) => {
    setEpgSelChannel(chId);
    setOverrideProgs([]);
    setEditingIdx(-1);
    setProgForm({ title: '', start: '', stop: '', desc: '' });
    if (!chId) { setRealEpg([]); return; }

    // Real EPG (raw, chưa merge override)
    fetch(`${BASE}/api/epg?raw=1`).then(r => r.json()).then(d => {
      const progs = (d?.data?.programmes || []).filter(p => p.channel === chId || p.channel === chId.replace(/\.vn$/i, ''));
      setRealEpg(progs.slice(0, 30));
    }).catch(() => setRealEpg([]));

    // Existing override
    const ov = epgOverridesList.find(o => o.channel_id === chId);
    if (ov) setOverrideProgs(Array.isArray(ov.programmes) ? ov.programmes : []);
  };

  const saveOverride = async () => {
    if (!epgSelChannel) return;
    const r = await fetch(`${BASE}/admin/epg-overrides`, { method: 'POST', headers, body: JSON.stringify({
      channel_id: epgSelChannel,
      channel_name: allChannels.find(ch => ch.channel_id === epgSelChannel)?.name || epgSelChannel,
      programmes: overrideProgs,
    }) });
    const d = await r.json();
    if (d.success) {
      addToast(`Đã lưu EPG tùy chỉnh cho ${epgSelChannel}`, 'success');
      fetch(`${BASE}/admin/epg-overrides`, { headers }).then(r => r.json()).then(dd => setEpgOverridesList(dd.overrides || [])).catch(() => {});
    } else addToast(d.error, 'error');
  };

  const clearOverride = async () => {
    if (!epgSelChannel) return;
    const r = await fetch(`${BASE}/admin/epg-overrides?channel_id=${encodeURIComponent(epgSelChannel)}`, { method: 'DELETE', headers });
    const d = await r.json();
    if (d.success) {
      addToast('Đã xóa EPG tùy chỉnh (trở về EPG gốc)', 'success');
      setOverrideProgs([]);
      setEditingIdx(-1);
      fetch(`${BASE}/admin/epg-overrides`, { headers }).then(r => r.json()).then(dd => setEpgOverridesList(dd.overrides || [])).catch(() => {});
    } else addToast(d.error, 'error');
  };

  const addProg = () => {
    if (!progForm.title.trim() || !progForm.start || !progForm.stop) {
      addToast('Cần điền tiêu đề, giờ bắt đầu và kết thúc', 'error');
      return;
    }
    const startXml = localToXmltv(progForm.start);
    const stopXml = localToXmltv(progForm.stop);
    if (!startXml || !stopXml) { addToast('Thời gian không hợp lệ', 'error'); return; }
    setOverrideProgs(prev => [...prev, { start: startXml, stop: stopXml, channel: epgSelChannel, title: progForm.title.trim(), desc: progForm.desc.trim() }]);
    setProgForm({ title: '', start: '', stop: '', desc: '' });
  };

  const updateProg = (i) => {
    if (!progForm.title.trim() || !progForm.start || !progForm.stop) { addToast('Cần điền đủ thông tin', 'error'); return; }
    const startXml = localToXmltv(progForm.start);
    const stopXml = localToXmltv(progForm.stop);
    if (!startXml || !stopXml) { addToast('Thời gian không hợp lệ', 'error'); return; }
    setOverrideProgs(prev => prev.map((p, idx) => idx === i ? { ...p, start: startXml, stop: stopXml, title: progForm.title.trim(), desc: progForm.desc.trim() } : p));
    setEditingIdx(-1);
    setProgForm({ title: '', start: '', stop: '', desc: '' });
  };

  const startEditProg = (i) => {
    const p = overrideProgs[i];
    setEditingIdx(i);
    setProgForm({ title: p.title, start: xmltvToLocal(p.start), stop: xmltvToLocal(p.stop), desc: p.desc || '' });
  };

  if (user?.role !== 'admin') return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1c24] border border-slate-800/60 rounded-2xl p-6 text-center max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-10 text-red-500 mx-auto mb-2 flex items-center justify-center"><Users className="w-8 h-8" /></div>
        <h3 className="text-base font-bold text-white mb-1">Không có quyền truy cập</h3>
        <p className="text-xs text-slate-500 mb-3">Bạn cần tài khoản Admin</p>
        <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-sm text-white rounded-xl">Đóng</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1c24] border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><Settings className="w-4 h-4 text-blue-400" /> Admin Panel</div>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-white">Đóng</button>
        </div>

        <div className="flex border-b border-slate-800/40 overflow-x-auto">
          {[{ id: 'stats', label: 'Thống kê', icon: BarChart3 }, { id: 'notify', label: 'Thông báo', icon: Bell }, { id: 'broadcast', label: 'Broadcast', icon: Send }, { id: 'epg', label: 'EPG kênh', icon: Calendar }, { id: 'analytics', label: 'Analytics', icon: TrendingUp }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'text-red-400 border-b-2 border-red-600' : 'text-slate-500 hover:text-white'}`}>
              <t.icon className="w-3 h-3" /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'stats' && stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Người dùng', value: stats.totalUsers, icon: Users, color: 'text-blue-400' },
                { label: 'Kênh', value: stats.totalChannels, icon: Radio, color: 'text-emerald-400' },
                { label: 'Lượt xem', value: stats.totalViews, icon: Eye, color: 'text-purple-400' },
                { label: 'Thông báo', value: stats.totalNotifications, icon: Bell, color: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/30">
                  <s.icon className={`w-5 h-5 ${s.color} mb-1`} />
                  <div className="text-lg font-bold text-white">{s.value}</div>
                  <div className="text-[10px] text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'notify' && (
            <form onSubmit={sendNotification} className="space-y-3">
              <input type="text" value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} placeholder="Tiêu đề thông báo" required className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none focus:border-red-600/60" />
              <textarea value={notifyBody} onChange={e => setNotifyBody(e.target.value)} placeholder="Nội dung thông báo..." required rows={3} className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none focus:border-red-600/60 resize-none" />
              <div className="flex gap-2">
                <select value={notifyType} onChange={e => setNotifyType(e.target.value)} className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl border border-slate-700">
                  <option value="info">Info</option><option value="warning">Warning</option><option value="event">Sự kiện</option><option value="promo">Khuyến mãi</option>
                </select>
                <input type="text" value={notifyChannel} onChange={e => setNotifyChannel(e.target.value)} placeholder="Channel ID (tùy chọn)" className="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none" />
                <button type="submit" className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Gửi</button>
              </div>
              <div className="text-[10px] text-slate-600">Thông báo sẽ hiển thị cho tất cả người dùng qua WebSocket</div>
            </form>
          )}

          {tab === 'broadcast' && (
            <form onSubmit={sendBroadcast} className="space-y-3">
              <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Tin broadcast (hiển thị banner trên trang)" required rows={2} className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none focus:border-red-600/60 resize-none" />
              <div className="flex gap-2 items-center">
                <select value={broadcastType} onChange={e => setBroadcastType(e.target.value)} className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl border border-slate-700">
                  <option value="info">Info</option><option value="warning">Cảnh báo</option><option value="event">Sự kiện</option>
                </select>
                <button type="submit" className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Broadcast</button>
              </div>
              {broadcasts.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Broadcast hiện tại:</p>
                  {broadcasts.map((b, i) => (
                    <div key={i} className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/30 text-xs text-slate-300">{b.message}</div>
                  ))}
                </div>
              )}
            </form>
          )}

          {tab === 'epg' && (
            <div className="space-y-4">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Tạo EPG tùy chỉnh riêng cho 1 kênh. Chương trình bạn thêm sẽ <b className="text-red-400">thay thế hoàn toàn</b> EPG gốc của kênh đó trên toàn app (trang chủ, LỊCH EPG, player).
              </p>

              {/* Channel select */}
              <div>
                <label className="text-[10px] text-slate-500 font-semibold uppercase block mb-1.5">Chọn kênh</label>
                <select value={epgSelChannel} onChange={e => loadEpgForChannel(e.target.value)} className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none">
                  <option value="">— Chọn kênh —</option>
                  {allChannels.map(ch => (
                    <option key={ch.channel_id} value={ch.channel_id}>{ch.name} ({ch.channel_id})</option>
                  ))}
                </select>
              </div>

              {epgSelChannel && (
                <>
                  {/* EPG gốc */}
                  <div>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase mb-1.5">EPG gốc hiện tại ({realEpg.length} chương trình)</p>
                    {realEpg.length === 0 ? (
                      <p className="text-[11px] text-slate-600 italic bg-slate-900/40 rounded-lg p-2 border border-slate-800/30">Kênh này chưa có dữ liệu EPG từ nguồn.</p>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {realEpg.map((p, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 bg-slate-900/40 rounded-lg px-2.5 py-1.5 border border-slate-800/30 text-[11px]">
                            <span className="text-slate-300 truncate">{p.title}</span>
                            <span className="text-slate-600 whitespace-nowrap shrink-0">{xmltvToLocal(p.start)} → {xmltvToLocal(p.stop)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Override editor */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">EPG tùy chỉnh ({overrideProgs.length} chương trình)</p>
                      <div className="flex gap-2">
                        <button onClick={saveOverride} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition"><Save className="w-3 h-3" /> Lưu override</button>
                        <button onClick={clearOverride} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition"><Trash2 className="w-3 h-3" /> Xóa</button>
                      </div>
                    </div>

                    {overrideProgs.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1 mb-3">
                        {overrideProgs.map((p, i) => (
                          <div key={i} className={`flex items-center gap-2 bg-slate-900/40 rounded-lg px-2.5 py-1.5 border ${editingIdx === i ? 'border-red-600/50' : 'border-slate-800/30'} text-[11px]`}>
                            <span className="text-slate-300 truncate flex-1">{p.title}</span>
                            <span className="text-slate-600 whitespace-nowrap shrink-0">{xmltvToLocal(p.start)} → {xmltvToLocal(p.stop)}</span>
                            <button onClick={() => startEditProg(i)} className="text-blue-400 hover:text-blue-300 shrink-0"><Settings className="w-3 h-3" /></button>
                            <button onClick={() => { setOverrideProgs(prev => prev.filter((_, idx) => idx !== i)); if (editingIdx === i) { setEditingIdx(-1); setProgForm({ title: '', start: '', stop: '', desc: '' }); } }} className="text-red-500 hover:text-red-400 shrink-0"><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add / edit form */}
                    <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">{editingIdx >= 0 ? '✏️ Sửa chương trình' : '➕ Thêm chương trình'}</p>
                      <input type="text" value={progForm.title} onChange={e => setProgForm({ ...progForm, title: e.target.value })} placeholder="Tên chương trình (vd: Thời sự 19h)" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="datetime-local" value={progForm.start} onChange={e => setProgForm({ ...progForm, start: e.target.value })} className="px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none [color-scheme:dark]" />
                        <input type="datetime-local" value={progForm.stop} onChange={e => setProgForm({ ...progForm, stop: e.target.value })} className="px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none [color-scheme:dark]" />
                      </div>
                      <textarea value={progForm.desc} onChange={e => setProgForm({ ...progForm, desc: e.target.value })} placeholder="Mô tả (tùy chọn)" rows={2} className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none resize-none" />
                      {editingIdx >= 0 ? (
                        <div className="flex gap-2">
                          <button onClick={() => updateProg(editingIdx)} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-xl flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Cập nhật</button>
                          <button onClick={() => { setEditingIdx(-1); setProgForm({ title: '', start: '', stop: '', desc: '' }); }} className="px-4 py-2 bg-slate-800 text-white text-[10px] font-bold rounded-xl">Hủy</button>
                        </div>
                      ) : (
                        <button onClick={addProg} className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-xl flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Thêm vào danh sách</button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">Múi giờ: UTC+7 (giờ Việt Nam). Sau khi lưu, bấm <b>Lưu override</b> để áp dụng cho toàn app.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-2">
              {analytics.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Chưa có dữ liệu</p>}
              {analytics.map((a, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800/30">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 rounded text-blue-400">{a.event}</span>
                    <span className="text-[11px] text-slate-400">{a.date}</span>
                  </div>
                  <span className="text-xs font-bold text-white">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
