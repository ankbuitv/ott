import React, { useState, useEffect } from 'react';
import { Settings, Users, BarChart3, Bell, Radio, Shield, Send, Eye, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const BASE = window.location.origin;

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

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/admin/stats`, { headers }).then(r => r.json()).then(d => d.stats && setStats(d.stats)).catch(() => {});
    fetch(`${BASE}/admin/analytics`, { headers }).then(r => r.json()).then(d => setAnalytics(d.analytics || [])).catch(() => {});
    fetch(`${BASE}/admin/notifications`, { headers }).then(r => r.json()).then(d => setNotifications(d.notifications || [])).catch(() => {});
    fetch(`${BASE}/admin/broadcasts`, { headers }).then(r => r.json()).then(d => setBroadcasts(d.broadcasts || [])).catch(() => {});
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

  if (user?.role !== 'admin') return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1c24] border border-slate-800/60 rounded-2xl p-6 text-center max-w-sm" onClick={e => e.stopPropagation()}>
        <Shield className="w-10 h-10 text-red-500 mx-auto mb-2" />
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

        <div className="flex border-b border-slate-800/40">
          {[{ id: 'stats', label: 'Thống kê', icon: BarChart3 }, { id: 'notify', label: 'Thông báo', icon: Bell }, { id: 'broadcast', label: 'Broadcast', icon: Send }, { id: 'analytics', label: 'Analytics', icon: TrendingUp }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold transition-all ${tab === t.id ? 'text-red-400 border-b-2 border-red-600' : 'text-slate-500 hover:text-white'}`}>
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
