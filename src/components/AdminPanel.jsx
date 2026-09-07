import React, { useState, useEffect } from 'react';
import { Settings, Users, BarChart3, Bell, Radio, Send, Eye, TrendingUp, Calendar, Plus, Trash2, Save, X, ScrollText, Ban, KeyRound, ShieldCheck, ChevronDown, Flag, Clapperboard, Crown, PartyPopper, Video } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE } from '../services/config';
import { LiveTab, GiftsTab, PaymentsTab, AdsTab, SchedTab, CommentsTab, PredictTab, ReportsTab, HealthTab, MovieSourcesTab, EXTRA_TABS } from './AdminExtras';

const BASE = API_BASE;

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

export default function AdminPanel({ onClose, asPage = false }) {
  const { token, user } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [creds, setCreds] = useState([]);
  const [credForm, setCredForm] = useState({ channel_id: '', upstream_token: '' });
  const [feedback, setFeedback] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [shortCreators, setShortCreators] = useState([]);
  const [shortForm, setShortForm] = useState({ title: '', caption: '', video_url: '', thumb_url: '', author: 'CHRTV' });
  const [events, setEvents] = useState([]);
  const [evForm, setEvForm] = useState({ title: '', subtitle: '', image_url: '', link_type: 'none', link_value: '', starts_at: '', ends_at: '', sort_order: 0 });
  const [editingEv, setEditingEv] = useState(null);
  const [sportsVids, setSportsVids] = useState([]);
  const [svForm, setSvForm] = useState({ title: '', league: '', thumb_url: '', video_url: '', duration: '', sort_order: 0 });
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState({ code: '', name: '', rank: 1, price: 0, price_text: '', tagline: '', allows: '', color: '#f36f21' });
  const [editingPlan, setEditingPlan] = useState(null);

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
    fetch(`${BASE}/admin/analytics/summary`, { headers }).then(r => r.json()).then(d => d.success && setSummary(d)).catch(() => {});
    fetch(`${BASE}/admin/users`, { headers }).then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
    fetch(`${BASE}/admin/audit`, { headers }).then(r => r.json()).then(d => setAudit(d.audit || [])).catch(() => {});
    fetch(`${BASE}/admin/stream-credentials`, { headers }).then(r => r.json()).then(d => setCreds(d.credentials || [])).catch(() => {});
    fetch(`${BASE}/admin/feedback`, { headers }).then(r => r.json()).then(d => setFeedback(d.feedback || [])).catch(() => {});
    fetch(`${BASE}/admin/shorts`, { headers }).then(r => r.json()).then(d => setShorts(d.shorts || [])).catch(() => {});
    fetch(`${BASE}/admin/short-creators`, { headers }).then(r => r.json()).then(d => setShortCreators(d.creators || [])).catch(() => {});
    fetch(`${BASE}/admin/events`, { headers }).then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {});
    fetch(`${BASE}/admin/sports-videos`, { headers }).then(r => r.json()).then(d => setSportsVids(d.videos || [])).catch(() => {});
    fetch(`${BASE}/admin/plans`, { headers }).then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => {});
  }, [token]);

  // ===== Quản lý user =====
  const userAction = async (id, action) => {
    if (action === 'delete' && !confirm('XÓA vĩnh viễn tài khoản này? Không thể hoàn tác!')) return;
    const r = await fetch(`${BASE}/admin/users/action`, { method: 'POST', headers, body: JSON.stringify({ id, action }) });
    const d = await r.json();
    if (d.success) {
      if (d.tempPassword) addToast(`Mật khẩu tạm: ${d.tempPassword} — gửi cho user ngay!`, 'success');
      else addToast('Đã thực hiện.', 'success');
      fetch(`${BASE}/admin/users`, { headers }).then(r => r.json()).then(dd => setUsers(dd.users || [])).catch(() => {});
      fetch(`${BASE}/admin/audit`, { headers }).then(r => r.json()).then(dd => setAudit(dd.audit || [])).catch(() => {});
    } else addToast(d.error || 'Lỗi', 'error');
  };

  // ===== Biểu đồ SVG =====
  const SimpleBarChart = ({ data, color = '#dc2626', label }) => {
    if (!data || data.length === 0) return <p className="text-[10px] text-slate-600 text-center py-3">Chưa có dữ liệu {label}</p>;
    const max = Math.max(...data.map((d) => d.count), 1);
    const W = 100, H = 34;
    const bw = W / Math.max(data.length, 7);
    return (
      <div>
        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">{label}</p>
        <svg viewBox={`0 0 ${W} ${H + 8}`} className="w-full h-20" preserveAspectRatio="none">
          {data.map((d, i) => {
            const h = (d.count / max) * H;
            return (
              <g key={i}>
                <rect x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={h} rx={0.8} fill={color} opacity={0.85} />
                {data.length <= 14 && (
                  <text x={i * bw + bw / 2} y={H + 6} fontSize={2.6} fill="#78716c" textAnchor="middle">{(d.date || '').slice(5)}</text>
                )}
              </g>
            );
          })}
        </svg>
        <p className="text-[9px] text-slate-600">Tổng: {data.reduce((s, d) => s + d.count, 0)} · cao nhất {max}/ngày</p>
      </div>
    );
  };

  const sendNotification = async (e) => {
    e.preventDefault();
    const r = await fetch(`${BASE}/admin/notify`, { method: 'POST', headers, body: JSON.stringify({ title: notifyTitle, body: notifyBody, type: notifyType, channel_id: notifyChannel }) });
    const d = await r.json();
    if (d.success) {
      addToast('Đã gửi thông báo!', 'success'); setNotifyTitle(''); setNotifyBody('');
      fetch(`${BASE}/admin/notifications`, { headers }).then(r => r.json()).then(dd => setNotifications(dd.notifications || [])).catch(() => {});
    } else addToast(d.error, 'error');
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    const r = await fetch(`${BASE}/admin/broadcast`, { method: 'POST', headers, body: JSON.stringify({ message: broadcastMsg, type: broadcastType, expires_in: 3600 }) });
    const d = await r.json();
    if (d.success) {
      addToast('Đã broadcast!', 'success'); setBroadcastMsg('');
      fetch(`${BASE}/admin/broadcasts`, { headers }).then(r => r.json()).then(dd => setBroadcasts(dd.broadcasts || [])).catch(() => {});
    } else addToast(d.error, 'error');
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
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div className="bg-[#1a1c24] border border-slate-800/60 rounded-2xl p-6 text-center max-w-sm modal-panel" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-10 text-[#f36f21] mx-auto mb-2 flex items-center justify-center"><Users className="w-8 h-8" /></div>
        <h3 className="text-base font-bold text-white mb-1">Không có quyền truy cập</h3>
        <p className="text-xs text-slate-500 mb-3">Bạn cần tài khoản Admin</p>
        <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-sm text-white rounded-xl">Đóng</button>
      </div>
    </div>
  );

  return (
    <div className={asPage ? 'w-full min-h-full bg-[#0b0b0d]' : 'fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop'} onClick={asPage ? undefined : onClose}>
      <div className={asPage ? 'bg-[#14151c] border border-white/[0.07] rounded-none md:rounded-2xl shadow-none md:shadow-2xl w-full max-w-[1400px] mx-auto min-h-[calc(100vh-5rem)] overflow-hidden flex flex-col' : 'bg-[#1a1c24] border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col modal-panel'} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between bg-gradient-to-r from-[#1a120c] to-[#12131a]">
          <div className="flex items-center gap-2 text-sm font-black text-white tracking-tight"><Settings className="w-4 h-4 text-[#ff9a3d]" /> Quản trị CHRTV</div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-stone-300">Đóng</button>
        </div>

        <div className="flex border-b border-slate-800/40 overflow-x-auto">
          {[{ id: 'stats', label: 'Thống kê', icon: BarChart3 }, ...EXTRA_TABS, { id: 'users', label: 'Người dùng', icon: Users }, { id: 'audit', label: 'Nhật ký', icon: ScrollText }, { id: 'notify', label: 'Thông báo', icon: Bell }, { id: 'broadcast', label: 'Broadcast', icon: Send }, { id: 'epg', label: 'EPG kênh', icon: Calendar }, { id: 'analytics', label: 'Analytics', icon: TrendingUp }, { id: 'credentials', label: 'Chìa khoá stream', icon: KeyRound }, { id: 'feedback', label: 'Báo lỗi', icon: Flag }, { id: 'shorts', label: 'Shorts', icon: Clapperboard }, { id: 'plans', label: 'Gói cước', icon: Crown }, { id: 'events', label: 'Sự kiện', icon: PartyPopper }, { id: 'sportsvids', label: 'Video TT', icon: Video }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'text-[#ff9a3d] border-b-2 border-[#f36f21]' : 'text-slate-500 hover:text-white'}`}>
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

          {tab === 'stats' && summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/30">
                <SimpleBarChart data={summary.viewsByDay || []} color="#dc2626" label="Lượt xem 14 ngày" />
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/30">
                <SimpleBarChart data={summary.loginsByDay || []} color="#059669" label="Đăng nhập 14 ngày" />
              </div>
              {(summary.topChannels || []).length > 0 && (
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/30 md:col-span-2">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Top kênh xem nhiều (30 ngày)</p>
                  {summary.topChannels.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] text-slate-600 w-4">{i + 1}.</span>
                      <span className="text-[11px] text-slate-300 flex-1 truncate">{c.channel_id}</span>
                      <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-[#f36f21] rounded-full" style={{ width: `${(c.count / (summary.topChannels[0]?.count || 1)) * 100}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-white w-8 text-right">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'notify' && (
            <div className="space-y-3">
              <form onSubmit={sendNotification} className="space-y-3">
                <input type="text" value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} placeholder="Tiêu đề thông báo" required className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none focus:border-[#f36f21]/60" />
                <textarea value={notifyBody} onChange={e => setNotifyBody(e.target.value)} placeholder="Nội dung thông báo..." required rows={3} className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none focus:border-[#f36f21]/60 resize-none" />
                <div className="flex gap-2">
                  <select value={notifyType} onChange={e => setNotifyType(e.target.value)} className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl border border-slate-700">
                    <option value="info">Info</option><option value="warning">Warning</option><option value="event">Sự kiện</option><option value="promo">Khuyến mãi</option>
                  </select>
                  <input type="text" value={notifyChannel} onChange={e => setNotifyChannel(e.target.value)} placeholder="Channel ID (tùy chọn)" className="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none" />
                  <button type="submit" className="px-4 py-2 bg-[#f36f21] text-white text-xs font-bold rounded-xl hover:bg-[#f36f21] transition-all flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Gửi</button>
                </div>
                <div className="text-[10px] text-slate-600">Thông báo sẽ hiển thị cho tất cả người dùng qua WebSocket</div>
              </form>
              {notifications.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Danh sách thông báo ({notifications.length}):</p>
                  <div className="space-y-1.5 max-h-[32vh] overflow-y-auto pr-1">
                    {notifications.map((n) => (
                      <div key={n.id} className="flex items-start gap-2 bg-slate-900/40 rounded-lg p-2.5 border border-slate-800/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white truncate">{n.title}</p>
                          <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{n.body}</p>
                          <p className="text-[9px] text-slate-600 mt-1">{n.type} {n.channel_id ? '· ' + n.channel_id : ''} · {n.created_at}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm('Xoá thông báo này?')) return;
                            const r = await fetch(`${BASE}/admin/notifications`, { method: 'DELETE', headers, body: JSON.stringify({ id: n.id }) });
                            const d = await r.json();
                            if (d.success) { addToast('Đã xoá thông báo', 'success'); setNotifications(prev => prev.filter(x => x.id !== n.id)); }
                            else addToast(d.error || 'Lỗi', 'error');
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-[#ff9a3d] hover:bg-[#f36f21]/10 shrink-0"
                          title="Xoá thông báo"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'broadcast' && (
            <div className="space-y-3">
              <form onSubmit={sendBroadcast} className="space-y-3">
                <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Tin broadcast (hiển thị banner trên trang)" required rows={2} className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-white focus:outline-none focus:border-[#f36f21]/60 resize-none" />
                <div className="flex gap-2 items-center">
                  <select value={broadcastType} onChange={e => setBroadcastType(e.target.value)} className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl border border-slate-700">
                    <option value="info">Info</option><option value="warning">Cảnh báo</option><option value="event">Sự kiện</option>
                  </select>
                  <button type="submit" className="px-4 py-2 bg-[#f36f21] text-white text-xs font-bold rounded-xl hover:bg-[#f36f21] transition-all flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Broadcast</button>
                </div>
              </form>
              {broadcasts.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Broadcast hiện tại ({broadcasts.length}):</p>
                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                    {broadcasts.map((b) => (
                      <div key={b.id} className="flex items-start gap-2 bg-slate-900/40 rounded-lg p-2.5 border border-slate-800/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-200 leading-relaxed">{b.message}</p>
                          <p className="text-[9px] text-slate-600 mt-1">{b.type} · {b.created_at} {b.expires_at ? '· hết hạn ' + new Date(b.expires_at * 1000).toLocaleString('vi-VN') : ''}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm('Xoá broadcast này? Banner sẽ biến mất với mọi user.')) return;
                            const r = await fetch(`${BASE}/admin/broadcast`, { method: 'DELETE', headers, body: JSON.stringify({ id: b.id }) });
                            const d = await r.json();
                            if (d.success) { addToast('Đã xoá broadcast', 'success'); setBroadcasts(prev => prev.filter(x => x.id !== b.id)); }
                            else addToast(d.error || 'Lỗi', 'error');
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-[#ff9a3d] hover:bg-[#f36f21]/10 shrink-0"
                          title="Xoá broadcast"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-[11px] text-slate-600 text-center py-3">Chưa có broadcast nào</p>}
            </div>
          )}

          {tab === 'epg' && (
            <div className="space-y-4">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Tạo EPG tùy chỉnh riêng cho 1 kênh. Chương trình bạn thêm sẽ <b className="text-[#ff9a3d]">thay thế hoàn toàn</b> EPG gốc của kênh đó trên toàn app (trang chủ, LỊCH EPG, player).
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
                          <div key={i} className={`flex items-center gap-2 bg-slate-900/40 rounded-lg px-2.5 py-1.5 border ${editingIdx === i ? 'border-[#f36f21]/50' : 'border-slate-800/30'} text-[11px]`}>
                            <span className="text-slate-300 truncate flex-1">{p.title}</span>
                            <span className="text-slate-600 whitespace-nowrap shrink-0">{xmltvToLocal(p.start)} → {xmltvToLocal(p.stop)}</span>
                            <button onClick={() => startEditProg(i)} className="text-blue-400 hover:text-blue-300 shrink-0"><Settings className="w-3 h-3" /></button>
                            <button onClick={() => { setOverrideProgs(prev => prev.filter((_, idx) => idx !== i)); if (editingIdx === i) { setEditingIdx(-1); setProgForm({ title: '', start: '', stop: '', desc: '' }); } }} className="text-[#f36f21] hover:text-[#ff9a3d] shrink-0"><X className="w-3 h-3" /></button>
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
                          <button onClick={() => updateProg(editingIdx)} className="flex-1 py-2 bg-[#f36f21] hover:bg-[#f36f21] text-white text-[10px] font-bold rounded-xl flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Cập nhật</button>
                          <button onClick={() => { setEditingIdx(-1); setProgForm({ title: '', start: '', stop: '', desc: '' }); }} className="px-4 py-2 bg-slate-800 text-white text-[10px] font-bold rounded-xl">Hủy</button>
                        </div>
                      ) : (
                        <button onClick={addProg} className="w-full py-2 bg-[#f36f21] hover:bg-[#f36f21] text-white text-[10px] font-bold rounded-xl flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Thêm vào danh sách</button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">Múi giờ: UTC+7 (giờ Việt Nam). Sau khi lưu, bấm <b>Lưu override</b> để áp dụng cho toàn app.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="space-y-1.5 max-h-[52vh] overflow-y-auto">
              {users.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Chưa có user nào</p>}
              {users.map((u) => (
                <div key={u.id} className={`rounded-xl px-3 py-2 border ${u.banned ? 'bg-[#7a2f0e]/30 border-[#7a2f0e]/40' : 'bg-slate-900/40 border-slate-800/30'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{u.username}</span>
                        {u.role === 'admin' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">ADMIN</span>}
                        {u.banned ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#f36f21] text-white">BỊ KHOÁ</span> : null}
                        {!u.email_verified && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">CHƯA XÁC MINH</span>}
                        {u.totp_enabled ? <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-600/30 text-amber-300">2FA</span> : null}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{u.email} · tạo {u.created_at}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {u.banned ? (
                        <button onClick={() => userAction(u.id, 'unban')} className="px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-600/30">Mở khoá</button>
                      ) : (
                        <button onClick={() => userAction(u.id, 'ban')} className="px-2 py-1 rounded-lg bg-[#f36f21]/20 text-[#ff9a3d] text-[10px] font-bold hover:bg-[#f36f21]/30 flex items-center gap-0.5"><Ban className="w-3 h-3" /> Khoá</button>
                      )}
                      {u.role === 'admin' ? (
                        <button onClick={() => userAction(u.id, 'demote')} className="px-2 py-1 rounded-lg bg-slate-700/50 text-slate-300 text-[10px] font-bold hover:bg-slate-700">Hạ admin</button>
                      ) : (
                        <button onClick={() => userAction(u.id, 'promote')} className="px-2 py-1 rounded-lg bg-blue-600/20 text-blue-400 text-[10px] font-bold hover:bg-blue-600/30">Lên admin</button>
                      )}
                      {u.totp_enabled && (
                        <button onClick={() => userAction(u.id, 'disable_2fa')} className="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-400 text-[10px] font-bold hover:bg-amber-600/30" title="Tắt 2FA của user này (lạc Authenticator)">Tắt 2FA</button>
                      )}
                      <button onClick={() => userAction(u.id, 'reset_password')} className="px-2 py-1 rounded-lg bg-slate-700/50 text-slate-300 text-[10px] font-bold hover:bg-slate-700 flex items-center gap-0.5" title="Reset mật khẩu"><KeyRound className="w-3 h-3" /></button>
                      <button onClick={() => userAction(u.id, 'delete')} className="px-2 py-1 rounded-lg bg-slate-700/50 text-[#ff9a3d] text-[10px] font-bold hover:bg-[#f36f21]/20"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-1 max-h-[52vh] overflow-y-auto">
              {audit.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Chưa có thao tác nào được ghi</p>}
              {audit.map((a) => (
                <div key={a.id} className="flex items-center gap-2 bg-slate-900/40 rounded-lg px-3 py-1.5 border border-slate-800/30">
                  <ShieldCheck className="w-3 h-3 text-slate-600 shrink-0" />
                  <span className="text-[10px] font-mono text-blue-400 shrink-0">{a.action}</span>
                  <span className="text-[10px] text-slate-400 truncate flex-1">{a.username || `user#${a.user_id}`} · {a.detail}</span>
                  <span className="text-[9px] text-slate-600 shrink-0">{a.created_at}</span>
                </div>
              ))}
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

          {tab === 'plans' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-600/30 bg-cyan-950/20 p-3">
                <p className="text-[11px] text-cyan-200/90 leading-relaxed">
                  <b>Rank quyết định quyền xem:</b> rank 1 = chỉ kênh VN · rank 2 = VN + Phim · rank ≥ 3 = xem hết.
                  Giá 0 = miễn phí. Sửa xong có hiệu lực ngay (không cần deploy).
                </p>
              </div>
              <div className="space-y-2">
                {plans.map(p => {
                  let allows = [];
                  try { allows = JSON.parse(p.allows || '[]'); } catch {}
                  const ed = editingPlan === p.code;
                  return (
                    <div key={p.code} className="bg-slate-900/40 rounded-xl px-3 py-2.5 border border-slate-800/30 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: p.color || '#f36f21' }}></span>
                        <span className="text-[12px] font-black text-white">{p.name}</span>
                        <span className="text-[9px] font-mono text-slate-500">{p.code} · rank {p.rank}</span>
                        <span className={`ml-auto text-[10px] font-bold ${Number(p.price) > 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
                          {Number(p.price) > 0 ? `${Number(p.price).toLocaleString('vi-VN')}đ` : (p.price_text || 'FREE')}
                        </span>
                        <button onClick={() => { setEditingPlan(ed ? null : p.code); setPlanForm({ code: p.code, name: p.name, rank: p.rank, price: p.price, price_text: p.price_text || '', tagline: p.tagline || '', allows: allows.join('\n'), color: p.color || '#f36f21' }); }} className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-800 text-slate-300 hover:text-white">{ed ? 'Đóng' : 'Sửa'}</button>
                        <button
                          onClick={async () => {
                            const ns = p.is_active === 0 ? 1 : 0;
                            await fetch(`${BASE}/admin/plans`, { method: 'PUT', headers, body: JSON.stringify({ code: p.code, is_active: ns }) });
                            setPlans(prev => prev.map(x => x.code === p.code ? { ...x, is_active: ns } : x));
                          }}
                          className="p-1.5 text-slate-500 hover:text-white" title={p.is_active === 0 ? 'Hiện' : 'Ẩn'}
                        ><Eye className="w-3.5 h-3.5" /></button>
                        {!['standard', 'recreational', 'ultimate', 'elite', 'signature'].includes(p.code) && (
                          <button
                            onClick={async () => {
                              if (!confirm('Xoá gói ' + p.code + '?')) return;
                              const r = await fetch(`${BASE}/admin/plans`, { method: 'DELETE', headers, body: JSON.stringify({ code: p.code }) });
                              const d = await r.json();
                              if (d.success) setPlans(prev => prev.filter(x => x.code !== p.code));
                              else addToast(d.error || 'Lỗi', 'error');
                            }}
                            className="p-1.5 text-slate-500 hover:text-[#ff9a3d]" title="Xoá"
                          ><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                      {p.is_active === 0 && <p className="text-[9px] text-slate-600">🙈 Đang ẩn với người dùng</p>}
                      {ed && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Tên gói" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <input value={planForm.tagline} onChange={e => setPlanForm({ ...planForm, tagline: e.target.value })} placeholder="Tagline" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Rank</span>
                            <input type="number" min={1} max={9} value={planForm.rank} onChange={e => setPlanForm({ ...planForm, rank: e.target.value })} className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[11px] text-white" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Giáđ</span>
                            <input type="number" min={0} value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[11px] text-white" />
                          </div>
                          <input value={planForm.price_text} onChange={e => setPlanForm({ ...planForm, price_text: e.target.value })} placeholder="Chữ thay giá (VD: TẠM FREE)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Màu</span>
                            <input type="color" value={planForm.color} onChange={e => setPlanForm({ ...planForm, color: e.target.value })} className="w-10 h-8 bg-transparent" />
                          </div>
                          <textarea value={planForm.allows} onChange={e => setPlanForm({ ...planForm, allows: e.target.value })} placeholder="Quyền lợi (mỗi dòng 1 cái)" rows={3} className="col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white resize-none" />
                          <button
                            onClick={async () => {
                              const r = await fetch(`${BASE}/admin/plans`, { method: 'PUT', headers, body: JSON.stringify({ ...planForm, rank: parseInt(planForm.rank) || 1, price: parseInt(planForm.price) || 0 }) });
                              const d = await r.json();
                              if (d.success) {
                                addToast('Đã lưu gói ' + planForm.code, 'success');
                                setEditingPlan(null);
                                fetch(`${BASE}/admin/plans`, { headers }).then(r2 => r2.json()).then(dd => setPlans(dd.plans || [])).catch(() => {});
                              } else addToast(d.error || 'Lỗi', 'error');
                            }}
                            className="col-span-2 py-2 btn-orange text-white text-[11px] font-bold rounded-xl"
                          >Lưu gói</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!planForm.code.trim() || !planForm.name.trim()) { addToast('Nhập mã + tên gói', 'error'); return; }
                  const r = await fetch(`${BASE}/admin/plans`, { method: 'POST', headers, body: JSON.stringify({ ...planForm, rank: parseInt(planForm.rank) || 1, price: parseInt(planForm.price) || 0 }) });
                  const d = await r.json();
                  if (d.success) {
                    addToast('Đã thêm gói!', 'success');
                    setPlanForm({ code: '', name: '', rank: 1, price: 0, price_text: '', tagline: '', allows: '', color: '#f36f21' });
                    fetch(`${BASE}/admin/plans`, { headers }).then(r2 => r2.json()).then(dd => setPlans(dd.plans || [])).catch(() => {});
                  } else addToast(d.error || 'Lỗi', 'error');
                }}
                className="space-y-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40"
              >
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Thêm gói mới</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={planForm.code} onChange={e => setPlanForm({ ...planForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="Mã gói (vd: sport)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-mono" />
                  <input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Tên hiển thị (vd: SPORT)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={1} max={9} value={planForm.rank} onChange={e => setPlanForm({ ...planForm, rank: e.target.value })} placeholder="Rank (1-9)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                  <input type="number" min={0} value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} placeholder="Giá VNĐ (0 = free)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                </div>
                <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Thêm gói</button>
              </form>
            </div>
          )}
          {tab === 'events' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-fuchsia-600/30 bg-fuchsia-950/20 p-3">
                <p className="text-[11px] text-fuchsia-200/90 leading-relaxed">
                  Banner chạy đầu <b>trang chủ</b>. Bấm vào banner sẽ: <b>none</b> = không làm gì · <b>tab</b> = mở mục (movies/tv/epg/plans) · <b>channel</b> = mở kênh (điền channel_id) · <b>url</b> = mở link ngoài.
                </p>
              </div>
              <div className="space-y-2">
                {events.length === 0 && <p className="text-xs text-slate-500 text-center py-3">Chưa có sự kiện nào</p>}
                {events.map(ev => {
                  const ed = editingEv === ev.id;
                  return (
                    <div key={ev.id} className="bg-slate-900/40 rounded-xl px-3 py-2.5 border border-slate-800/30 space-y-2">
                      <div className="flex items-center gap-2.5">
                        {ev.image_url ? <img src={ev.image_url} alt="" className="w-14 h-9 object-cover rounded-md shrink-0" onError={e => e.target.style.display = 'none'} /> : <span className="w-14 h-9 rounded-md grad-brand flex items-center justify-center text-base shrink-0">🎉</span>}
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-black text-white truncate">{ev.title}</p>
                          <p className="text-[9px] text-slate-500 truncate">{ev.link_type !== 'none' ? `${ev.link_type}:${ev.link_value}` : 'không link'} · thứ tự {ev.sort_order} {ev.is_active === 0 ? '· 🙈 ẩn' : ''}</p>
                        </div>
                        <button onClick={() => { setEditingEv(ed ? null : ev.id); setEvForm({ title: ev.title || '', subtitle: ev.subtitle || '', image_url: ev.image_url || '', link_type: ev.link_type || 'none', link_value: ev.link_value || '', starts_at: (ev.starts_at || '').replace(' ', 'T').slice(0, 16), ends_at: (ev.ends_at || '').replace(' ', 'T').slice(0, 16), sort_order: ev.sort_order || 0 }); }} className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-800 text-slate-300 hover:text-white">{ed ? 'Đóng' : 'Sửa'}</button>
                        <button
                          onClick={async () => {
                            const ns = ev.is_active === 0 ? 1 : 0;
                            await fetch(`${BASE}/admin/events`, { method: 'PUT', headers, body: JSON.stringify({ id: ev.id, is_active: ns }) });
                            setEvents(prev => prev.map(x => x.id === ev.id ? { ...x, is_active: ns } : x));
                          }}
                          className="p-1.5 text-slate-500 hover:text-white" title={ev.is_active === 0 ? 'Hiện' : 'Ẩn'}
                        ><Eye className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={async () => {
                            if (!confirm('Xoá sự kiện này?')) return;
                            await fetch(`${BASE}/admin/events`, { method: 'DELETE', headers, body: JSON.stringify({ id: ev.id }) });
                            setEvents(prev => prev.filter(x => x.id !== ev.id));
                          }}
                          className="p-1.5 text-slate-500 hover:text-[#ff9a3d]" title="Xoá"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      {ed && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <input value={evForm.title} onChange={e => setEvForm({ ...evForm, title: e.target.value })} placeholder="Tiêu đề" className="col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <input value={evForm.subtitle} onChange={e => setEvForm({ ...evForm, subtitle: e.target.value })} placeholder="Mô tả ngắn" className="col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <input value={evForm.image_url} onChange={e => setEvForm({ ...evForm, image_url: e.target.value })} placeholder="Ảnh banner https://... (trống = nền gradient)" className="col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <select value={evForm.link_type} onChange={e => setEvForm({ ...evForm, link_type: e.target.value })} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[11px] text-white">
                            <option value="none">Không link</option>
                            <option value="tab">Mở mục (tab)</option>
                            <option value="channel">Mở kênh</option>
                            <option value="url">Link ngoài</option>
                          </select>
                          <input value={evForm.link_value} onChange={e => setEvForm({ ...evForm, link_value: e.target.value })} placeholder="movies / channel_id / https://..." className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-slate-500 shrink-0">Từ</span>
                            <input type="datetime-local" value={evForm.starts_at} onChange={e => setEvForm({ ...evForm, starts_at: e.target.value })} className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-1.5 py-1.5 text-[10px] text-white" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-slate-500 shrink-0">Đến</span>
                            <input type="datetime-local" value={evForm.ends_at} onChange={e => setEvForm({ ...evForm, ends_at: e.target.value })} className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-1.5 py-1.5 text-[10px] text-white" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Thứ tự</span>
                            <input type="number" value={evForm.sort_order} onChange={e => setEvForm({ ...evForm, sort_order: e.target.value })} className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[11px] text-white" />
                          </div>
                          <button
                            onClick={async () => {
                              const body = { ...evForm, id: ev.id, sort_order: parseInt(evForm.sort_order) || 0, starts_at: (evForm.starts_at || '').replace('T', ' ').slice(0, 19), ends_at: (evForm.ends_at || '').replace('T', ' ').slice(0, 19) };
                              const r = await fetch(`${BASE}/admin/events`, { method: 'PUT', headers, body: JSON.stringify(body) });
                              const d = await r.json();
                              if (d.success) {
                                addToast('Đã lưu sự kiện', 'success');
                                setEditingEv(null);
                                fetch(`${BASE}/admin/events`, { headers }).then(r2 => r2.json()).then(dd => setEvents(dd.events || [])).catch(() => {});
                              } else addToast(d.error || 'Lỗi', 'error');
                            }}
                            className="py-2 btn-orange text-white text-[11px] font-bold rounded-xl"
                          >Lưu</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!evForm.title.trim()) { addToast('Nhập tiêu đề', 'error'); return; }
                  const body = { ...evForm, sort_order: parseInt(evForm.sort_order) || 0, starts_at: (evForm.starts_at || '').replace('T', ' ').slice(0, 19), ends_at: (evForm.ends_at || '').replace('T', ' ').slice(0, 19) };
                  const r = await fetch(`${BASE}/admin/events`, { method: 'POST', headers, body: JSON.stringify(body) });
                  const d = await r.json();
                  if (d.success) {
                    addToast('Đã thêm sự kiện!', 'success');
                    setEvForm({ title: '', subtitle: '', image_url: '', link_type: 'none', link_value: '', starts_at: '', ends_at: '', sort_order: 0 });
                    fetch(`${BASE}/admin/events`, { headers }).then(r2 => r2.json()).then(dd => setEvents(dd.events || [])).catch(() => {});
                  } else addToast(d.error || 'Lỗi', 'error');
                }}
                className="space-y-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40"
              >
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Thêm sự kiện mới</p>
                <input value={evForm.title} onChange={e => setEvForm({ ...evForm, title: e.target.value })} placeholder="Tiêu đề (vd: 🎉 Chung kết AFF Cup)" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                <input value={evForm.subtitle} onChange={e => setEvForm({ ...evForm, subtitle: e.target.value })} placeholder="Mô tả ngắn" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                <input value={evForm.image_url} onChange={e => setEvForm({ ...evForm, image_url: e.target.value })} placeholder="Ảnh banner https://... (trống = nền gradient)" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={evForm.link_type} onChange={e => setEvForm({ ...evForm, link_type: e.target.value })} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[11px] text-white">
                    <option value="none">Không link</option>
                    <option value="tab">Mở mục (tab)</option>
                    <option value="channel">Mở kênh</option>
                    <option value="url">Link ngoài</option>
                  </select>
                  <input value={evForm.link_value} onChange={e => setEvForm({ ...evForm, link_value: e.target.value })} placeholder="movies / channel_id / https://..." className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                </div>
                <button type="submit" className="w-full py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Thêm sự kiện</button>
              </form>
            </div>
          )}
          {tab === 'sportsvids' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-600/30 bg-emerald-950/20 p-3">
                <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                  Video xem lại trong trang <b>Thể thao</b>. Link YouTube (watch/shorts/youtu.be) tự nhúng · mp4 phát trực tiếp.
                </p>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!svForm.title.trim() || !svForm.video_url.trim()) { addToast('Nhập tiêu đề + link video', 'error'); return; }
                  const r = await fetch(`${BASE}/admin/sports-videos`, { method: 'POST', headers, body: JSON.stringify({ ...svForm, sort_order: parseInt(svForm.sort_order) || 0 }) });
                  const d = await r.json();
                  if (d.success) {
                    addToast('Đã thêm video!', 'success');
                    setSvForm({ title: '', league: '', thumb_url: '', video_url: '', duration: '', sort_order: 0 });
                    fetch(`${BASE}/admin/sports-videos`, { headers }).then(r2 => r2.json()).then(dd => setSportsVids(dd.videos || [])).catch(() => {});
                  } else addToast(d.error || 'Lỗi', 'error');
                }}
                className="space-y-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40"
              >
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Thêm video xem lại</p>
                <input value={svForm.title} onChange={e => setSvForm({ ...svForm, title: e.target.value })} placeholder="Tiêu đề (vd: Highlights MU 2-1 Everton)" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                <input value={svForm.video_url} onChange={e => setSvForm({ ...svForm, video_url: e.target.value })} placeholder="Link YouTube hoặc mp4 https://..." className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={svForm.league} onChange={e => setSvForm({ ...svForm, league: e.target.value })} placeholder="Giải (EPL...)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                  <input value={svForm.duration} onChange={e => setSvForm({ ...svForm, duration: e.target.value })} placeholder="Dài (10:24)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                  <input type="number" value={svForm.sort_order} onChange={e => setSvForm({ ...svForm, sort_order: e.target.value })} placeholder="Thứ tự" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                </div>
                <input value={svForm.thumb_url} onChange={e => setSvForm({ ...svForm, thumb_url: e.target.value })} placeholder="Ảnh bìa https://... (trống cũng được)" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-white" />
                <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Thêm video</button>
              </form>
              <div className="space-y-2">
                {sportsVids.length === 0 && <p className="text-xs text-slate-500 text-center py-3">Chưa có video nào</p>}
                {sportsVids.map(v => (
                  <div key={v.id} className="flex items-center gap-2.5 bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800/30">
                    {v.thumb_url ? <img src={v.thumb_url} alt="" className="w-16 h-9 object-cover rounded-md shrink-0" onError={e => e.target.style.display = 'none'} /> : <span className="w-16 h-9 rounded-md grad-brand flex items-center justify-center text-sm shrink-0">⚽</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white truncate">{v.title}</p>
                      <p className="text-[9px] text-slate-500">{v.league || '—'} {v.is_active === 0 ? '· 🙈 ẩn' : ''}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const ns = v.is_active === 0 ? 1 : 0;
                        await fetch(`${BASE}/admin/sports-videos`, { method: 'PUT', headers, body: JSON.stringify({ id: v.id, is_active: ns }) });
                        setSportsVids(prev => prev.map(x => x.id === v.id ? { ...x, is_active: ns } : x));
                      }}
                      className="p-1.5 text-slate-500 hover:text-white" title={v.is_active === 0 ? 'Hiện' : 'Ẩn'}
                    ><Eye className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={async () => {
                        if (!confirm('Xoá video này?')) return;
                        await fetch(`${BASE}/admin/sports-videos`, { method: 'DELETE', headers, body: JSON.stringify({ id: v.id }) });
                        setSportsVids(prev => prev.filter(x => x.id !== v.id));
                      }}
                      className="p-1.5 text-slate-500 hover:text-[#ff9a3d]" title="Xoá"
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
                    {tab === 'shorts' && (
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!shortForm.video_url.trim()) { addToast('Nhập link video', 'error'); return; }
                  const r = await fetch(`${BASE}/admin/shorts`, { method: 'POST', headers, body: JSON.stringify(shortForm) });
                  const d = await r.json();
                  if (d.success) {
                    addToast('Đã đăng short!', 'success');
                    setShortForm({ title: '', caption: '', video_url: '', thumb_url: '', author: 'CHRTV' });
                    fetch(`${BASE}/admin/shorts`, { headers }).then(r2 => r2.json()).then(dd => setShorts(dd.shorts || [])).catch(() => {});
                  } else addToast(d.error || 'Lỗi', 'error');
                }}
                className="space-y-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40"
              >
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Đăng short mới (admin - link mp4 trực tiếp)</p>
                <input value={shortForm.title} onChange={e => setShortForm({ ...shortForm, title: e.target.value })} placeholder="Tiêu đề" className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]" />
                <input value={shortForm.video_url} onChange={e => setShortForm({ ...shortForm, video_url: e.target.value })} placeholder="Link video mp4 https://..." className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={shortForm.thumb_url} onChange={e => setShortForm({ ...shortForm, thumb_url: e.target.value })} placeholder="Ảnh bìa (không bắt buộc)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]" />
                  <input value={shortForm.author} onChange={e => setShortForm({ ...shortForm, author: e.target.value })} placeholder="Tác giả (fallback nếu không có creator)" className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]" />
                </div>
                <textarea value={shortForm.caption} onChange={e => setShortForm({ ...shortForm, caption: e.target.value })} placeholder="Mô tả ngắn" rows={2} className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21] resize-none" />
                <button type="submit" className="w-full py-2 btn-orange text-white text-xs font-bold rounded-xl">Đăng short</button>
              </form>

              {shortCreators.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Creator profiles ({shortCreators.length}) - avatar, bio, follow</p>
                  <div className="space-y-1.5 max-h-[32vh] overflow-y-auto pr-1">
                    {shortCreators.map(c => (
                      <div key={c.id} className="flex items-center gap-2.5 bg-slate-900/40 rounded-xl px-3 py-2.5 border border-slate-800/30">
                        {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" /> : <span className="w-9 h-9 rounded-full bg-[#f36f21]/20 text-[#f36f21] flex items-center justify-center text-[11px] font-black shrink-0">{(c.display_name||c.handle||'C')[0].toUpperCase()}</span>}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white flex items-center gap-1 truncate">{c.display_name} <span className="text-slate-500 font-normal">@{c.handle}</span> {c.verified ? <span className="text-cyan-400 text-[10px]">✓</span> : null}</p>
                          <p className="text-[10px] text-slate-400 truncate">{c.bio || '—'} · {c.followers||0} followers · {c.shorts_count||0} shorts</p>
                        </div>
                        <button onClick={async () => {
                          const r = await fetch(`${BASE}/admin/short-creators`, { method: 'PUT', headers, body: JSON.stringify({ id: c.id, verified: c.verified ? 0 : 1 }) });
                          const d = await r.json();
                          if (d.success) { addToast(c.verified ? 'Đã bỏ tick xanh' : 'Đã xác minh ✓', 'success'); setShortCreators(prev => prev.map(x => x.id===c.id ? {...x, verified: x.verified ? 0 : 1} : x)); }
                        }} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${c.verified ? 'bg-cyan-600/20 text-cyan-300' : 'bg-slate-700/50 text-slate-300'}`}>{c.verified ? '✓ Verified' : 'Verify'}</button>
                        <button onClick={async () => {
                          if (!confirm('Xoá creator @'+c.handle+'? Video của họ sẽ mất creator link.')) return;
                          const r = await fetch(`${BASE}/admin/short-creators`, { method: 'DELETE', headers, body: JSON.stringify({ id: c.id }) });
                          const d = await r.json();
                          if (d.success) { addToast('Đã xoá creator', 'success'); setShortCreators(prev => prev.filter(x => x.id!==c.id)); }
                        }} className="p-1.5 text-slate-500 hover:text-[#ff9a3d]"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Shorts ({shorts.length})</p>
                {shorts.length === 0 && <p className="text-xs text-slate-500 text-center py-3">Chưa có short nào</p>}
                {shorts.map(s => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800/30">
                    {s.thumb_url ? <img src={s.thumb_url} alt="" className="w-9 h-14 object-cover rounded-md shrink-0" onError={e => e.target.style.display = 'none'} /> : <span className="w-9 h-14 rounded-md grad-brand flex items-center justify-center text-sm shrink-0">🎬</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white truncate">{s.title || '(không tên)'} {s.creator_handle ? <span className="text-[10px] text-[#f36f21] font-normal">· @{s.creator_handle}</span> : s.author ? <span className="text-[10px] text-slate-500 font-normal">· {s.author}</span> : null}</p>
                      <p className="text-[9px] text-slate-500">👁 {s.views || 0} · ❤ {s.likes || 0} · {s.status === 'hidden' ? '🙈 Đang ẩn' : '✅ Đang hiện'} {s.creator_name ? '· ' + s.creator_name : ''}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const ns = s.status === 'hidden' ? 'live' : 'hidden';
                        await fetch(`${BASE}/admin/shorts`, { method: 'PUT', headers, body: JSON.stringify({ id: s.id, status: ns }) });
                        setShorts(prev => prev.map(x => x.id === s.id ? { ...x, status: ns } : x));
                      }}
                      className="p-1.5 text-slate-500 hover:text-white" title={s.status === 'hidden' ? 'Hiện' : 'Ẩn'}
                    ><Eye className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={async () => {
                        if (!confirm('Xoá short này?')) return;
                        await fetch(`${BASE}/admin/shorts`, { method: 'DELETE', headers, body: JSON.stringify({ id: s.id }) });
                        setShorts(prev => prev.filter(x => x.id !== s.id));
                      }}
                      className="p-1.5 text-slate-500 hover:text-[#ff9a3d]" title="Xoá"
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'feedback' && (
            <div className="space-y-2">
              {feedback.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Chưa có báo lỗi nào 🎉</p>}
              {feedback.map((f) => {
                let info = {};
                try { info = JSON.parse(f.client_info || '{}'); } catch {}
                return (
                  <div key={f.id} className="bg-slate-900/40 rounded-lg px-3 py-2.5 border border-slate-800/30 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-white truncate">{f.channel_id || 'Kênh?'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={f.status || 'new'}
                          onChange={async (e) => {
                            const status = e.target.value;
                            await fetch(`${BASE}/admin/feedback`, { method: 'PUT', headers, body: JSON.stringify({ id: f.id, status }) });
                            setFeedback(prev => prev.map(x => x.id === f.id ? { ...x, status } : x));
                          }}
                          className="bg-slate-800 text-[10px] text-slate-200 px-2 py-1 rounded-lg border border-slate-700"
                        >
                          <option value="new">🆕 Mới</option>
                          <option value="doing">🔧 Đang xử lý</option>
                          <option value="done">✅ Xong</option>
                        </select>
                        <button
                          onClick={async () => {
                            if (!confirm('Xoá báo lỗi này?')) return;
                            await fetch(`${BASE}/admin/feedback`, { method: 'DELETE', headers, body: JSON.stringify({ id: f.id }) });
                            setFeedback(prev => prev.filter(x => x.id !== f.id));
                          }}
                          className="p-1.5 text-slate-500 hover:text-[#ff9a3d]" title="Xoá"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{f.message}</p>
                    <p className="text-[9px] text-slate-600 font-mono break-all">
                      {info.program ? `CT: ${info.program} · ` : ''}{info.upstreamUA ? `UA: ${info.upstreamUA} · ` : ''}{f.created_at ? new Date(typeof f.created_at === 'number' ? f.created_at * 1000 : f.created_at).toLocaleString('vi-VN') : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'credentials' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-600/30 bg-amber-950/20 p-3">
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  <b>Chìa khoá phát của Stream Engine</b> (playback token cho kênh premium — ví dụ X-Access-Token).
                  Worker tự inject token này khi proxy fetch upstream; token <b>không bao giờ</b> trả về API
                  công khai. Sau khi <b>rotate token trên Stream Engine</b>, cập nhật token mới ở đây — kênh
                  premium phát lại ngay, kênh FTA không ảnh hưởng.
                </p>
              </div>
              <div className="space-y-1.5">
                {creds.length === 0 && <p className="text-xs text-slate-500 text-center py-3">Chưa có credential nào</p>}
                {creds.map((c) => (
                  <div key={c.channel_id} className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[11px] font-mono text-white truncate">{c.channel_id}</span>
                      <span className="text-[10px] text-slate-500">
                        {c.updated_at ? 'cập nhật ' + new Date(c.updated_at * 1000).toLocaleString('vi-VN') : ''}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm('Xoá credential của kênh ' + c.channel_id + '?')) return;
                        await fetch(`${BASE}/admin/stream-credentials`, { method: 'DELETE', headers, body: JSON.stringify({ channel_id: c.channel_id }) });
                        addToast('Đã xoá.', 'success');
                        fetch(`${BASE}/admin/stream-credentials`, { headers }).then(r => r.json()).then(d => setCreds(d.credentials || [])).catch(() => {});
                      }}
                      className="p-1.5 text-slate-500 hover:text-[#ff9a3d]" title="Xoá"
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!credForm.channel_id.trim() || !credForm.upstream_token.trim()) return;
                  const r = await fetch(`${BASE}/admin/stream-credentials`, { method: 'POST', headers, body: JSON.stringify(credForm) });
                  const d = await r.json();
                  if (d.success) {
                    addToast('Đã lưu credential cho ' + credForm.channel_id + '.', 'success');
                    setCredForm({ channel_id: '', upstream_token: '' });
                    fetch(`${BASE}/admin/stream-credentials`, { headers }).then(r2 => r2.json()).then(dd => setCreds(dd.credentials || [])).catch(() => {});
                  } else addToast(d.error || 'Lỗi', 'error');
                }}
                className="space-y-2 pt-1"
              >
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Thêm / cập nhật (kênh + token mới sau rotate)</p>
                <input value={credForm.channel_id} onChange={(e) => setCredForm({ ...credForm, channel_id: e.target.value })}
                  placeholder="channel_id (vd: hbohd)"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#f36f21]/50" />
                <input value={credForm.upstream_token} onChange={(e) => setCredForm({ ...credForm, upstream_token: e.target.value })}
                  placeholder="playback token mới từ Stream Engine (≥ 16 ký tự)" type="password"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#f36f21]/50" />
                <button type="submit" className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all">
                  <Save className="w-3.5 h-3.5" /> Lưu credential
                </button>
              </form>
            </div>
          )}
          {tab === 'health' && <HealthTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'live' && <LiveTab BASE={BASE} headers={headers} />}
          {tab === 'gifts' && <GiftsTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'payments' && <PaymentsTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'ads' && <AdsTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'moviesrc' && <MovieSourcesTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'sched' && <SchedTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'comments' && <CommentsTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'predict' && <PredictTab BASE={BASE} headers={headers} addToast={addToast} />}
          {tab === 'reports' && <ReportsTab BASE={BASE} headers={headers} token={token} />}
        </div>
      </div>
    </div>
  );
}
