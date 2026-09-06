/**
 * Huy hiệu xem TV (lưu máy cục bộ): giờ xem, streak ngày, khám phá kênh, cú đêm...
 */

const KEY = 'chrtv_stats_v1';

export const BADGES = [
  { id: 'first_watch', icon: '📺', name: 'Chào sân', desc: 'Xem kênh đầu tiên' },
  { id: 'hour1', icon: '⏱️', name: 'Mọt phim 1h', desc: 'Tích luỹ 1 giờ xem' },
  { id: 'hour10', icon: '🔥', name: 'Cày 10 giờ', desc: 'Tích luỹ 10 giờ xem' },
  { id: 'hour50', icon: '🚀', name: 'Cày 50 giờ', desc: 'Tích luỹ 50 giờ xem' },
  { id: 'hour100', icon: '👑', name: 'Huyền thoại 100h', desc: 'Tích luỹ 100 giờ xem' },
  { id: 'streak3', icon: '🌱', name: 'Đều đặn 3 ngày', desc: 'Xem 3 ngày liên tiếp' },
  { id: 'streak7', icon: '⚡', name: 'Tuần lễ vàng', desc: 'Xem 7 ngày liên tiếp' },
  { id: 'streak30', icon: '💎', name: 'Fan cứng 30 ngày', desc: 'Xem 30 ngày liên tiếp' },
  { id: 'explorer10', icon: '🧭', name: 'Nhà thám hiểm', desc: 'Xem 10 kênh khác nhau' },
  { id: 'explorer50', icon: '🌍', name: 'Vòng quanh thế giới', desc: 'Xem 50 kênh khác nhau' },
  { id: 'night_owl', icon: '🦉', name: 'Cú đêm', desc: 'Xem sau 23h' },
  { id: 'early_bird', icon: '🐦', name: 'Chim sớm', desc: 'Xem trước 6h sáng' },
];

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { days: {}, totalSec: 0, streak: 0, lastDay: '', channels: [], badges: [], ...s };
    }
  } catch {}
  return { days: {}, totalSec: 0, streak: 0, lastDay: '', channels: [], badges: [] };
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

function earn(s, id) {
  if (!s.badges.includes(id)) { s.badges.push(id); return id; }
  return null;
}

// Cộng giờ xem — trả về mảng huy hiệu MỚI đạt được
export function addWatch(seconds, channelId = '') {
  const s = getStats();
  const now = new Date();
  const t = todayStr(now);
  const sec = Math.max(0, Math.min(3600, Math.floor(seconds || 0)));
  if (sec <= 0 && !channelId) return [];
  const earned = [];
  if (sec > 0) {
    s.days[t] = (s.days[t] || 0) + sec;
    s.totalSec += sec;
    // Streak: hôm nay có ≥60s xem
    if (s.days[t] >= 60 && s.lastDay !== t) {
      const y = new Date(now.getTime() - 86400000);
      s.streak = s.lastDay === todayStr(y) ? s.streak + 1 : 1;
      s.lastDay = t;
    }
    const h = now.getHours();
    if (h >= 23 || h < 4) { const b = earn(s, 'night_owl'); if (b) earned.push(b); }
    if (h >= 4 && h < 6) { const b = earn(s, 'early_bird'); if (b) earned.push(b); }
  }
  if (channelId && !s.channels.includes(channelId)) {
    s.channels.push(channelId);
    if (s.channels.length === 1) { const b = earn(s, 'first_watch'); if (b) earned.push(b); }
    if (s.channels.length >= 10) { const b = earn(s, 'explorer10'); if (b) earned.push(b); }
    if (s.channels.length >= 50) { const b = earn(s, 'explorer50'); if (b) earned.push(b); }
  }
  if (s.totalSec >= 3600) { const b = earn(s, 'hour1'); if (b) earned.push(b); }
  if (s.totalSec >= 36000) { const b = earn(s, 'hour10'); if (b) earned.push(b); }
  if (s.totalSec >= 180000) { const b = earn(s, 'hour50'); if (b) earned.push(b); }
  if (s.totalSec >= 360000) { const b = earn(s, 'hour100'); if (b) earned.push(b); }
  if (s.streak >= 3) { const b = earn(s, 'streak3'); if (b) earned.push(b); }
  if (s.streak >= 7) { const b = earn(s, 'streak7'); if (b) earned.push(b); }
  if (s.streak >= 30) { const b = earn(s, 'streak30'); if (b) earned.push(b); }
  save(s);
  return earned;
}

export function fmtHours(sec) {
  const h = Math.floor((sec || 0) / 3600);
  if (h >= 1) return `${h}h${Math.floor(((sec || 0) % 3600) / 60)}p`;
  const m = Math.floor((sec || 0) / 60);
  return `${m}p`;
}
