// Nhắc lịch cục bộ (trận đấu, phim sắp chiếu): localStorage + Notification API.
// Chạy ngay cả khi mất mạng; App kiểm tra mỗi 60s.
const KEY = 'chrtv_local_reminders_v1';

export function getLocalReminders() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); } catch {}
}

export function hasReminder(id) {
  return getLocalReminders().some(r => r.id === id && !r.fired);
}
export function addLocalReminder({ id, title, body = '', at }) {
  if (!id || !at) return false;
  const list = getLocalReminders().filter(r => r.id !== id);
  list.push({ id, title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 200), at, fired: false });
  save(list);
  return true;
}
export function removeLocalReminder(id) {
  save(getLocalReminders().filter(r => r.id !== id));
}

export async function ensureNotifyPermission() {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch { return false; }
}

// Trả về các nhắc đến giờ (đánh dấu fired) — caller hiện toast + Notification
export function popDueReminders() {
  const now = Date.now();
  const list = getLocalReminders();
  const due = list.filter(r => !r.fired && r.at <= now);
  if (!due.length) return [];
  save(list.map(r => (r.fired || r.at > now ? r : { ...r, fired: true })));
  return due;
}
export function fireBrowserNotification(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'https://i.ibb.co/VcLxwgM2/logo.png' });
    }
  } catch {}
}
export function fmtRemindTime(ts) {
  try {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}
