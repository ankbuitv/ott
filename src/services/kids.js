// Bé & gia đình: giới hạn giờ xem/ngày, thống kê theo hồ sơ (báo cáo phụ huynh), PIN mở app.
const LIMITS_KEY = 'chrtv_kid_limits_v1';   // {profileId: {min, bonusMin, bonusDate}}
const STATS_KEY = 'chrtv_profile_stats_v1'; // {profileId: {days: {date: sec}, top: {ref: sec}}}
const PIN_KEY = 'chrtv_app_pin_v1';

function dayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function read(key, fb) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb)); } catch { return fb; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

// ---- Giới hạn giờ xem của bé (phút/ngày, 0 = không giới hạn) ----
export function getKidLimit(profileId) {
  const l = read(LIMITS_KEY, {})[profileId];
  if (!l) return 0;
  const bonus = l.bonusDate === dayStr() ? (l.bonusMin || 0) : 0;
  return (l.min || 0) + bonus;
}
export function setKidLimit(profileId, min) {
  const all = read(LIMITS_KEY, {});
  all[profileId] = { ...(all[profileId] || {}), min: Math.max(0, Math.min(1440, parseInt(min) || 0)) };
  write(LIMITS_KEY, all);
}
export function addKidBonus(profileId, min = 30) {
  const all = read(LIMITS_KEY, {});
  const cur = all[profileId] || { min: 0 };
  const today = dayStr();
  all[profileId] = { ...cur, bonusMin: (cur.bonusDate === today ? cur.bonusMin || 0 : 0) + min, bonusDate: today };
  write(LIMITS_KEY, all);
}

// ---- Thống kê giờ xem theo hồ sơ ----
export function recordProfileWatch(profileId, sec, ref = '') {
  if (!profileId || !sec) return;
  const all = read(STATS_KEY, {});
  const p = all[profileId] || { days: {}, top: {} };
  const d = dayStr();
  p.days[d] = (p.days[d] || 0) + sec;
  if (ref) p.top[ref] = (p.top[ref] || 0) + sec;
  // Giữ 30 ngày gần nhất
  const keys = Object.keys(p.days).sort().slice(-30);
  const days = {};
  keys.forEach(k => { days[k] = p.days[k]; });
  p.days = days;
  const tops = Object.entries(p.top).sort((a, b) => b[1] - a[1]).slice(0, 30);
  p.top = Object.fromEntries(tops);
  all[profileId] = p;
  write(STATS_KEY, all);
}
export function getTodaySec(profileId) {
  const p = read(STATS_KEY, {})[profileId];
  return p?.days?.[dayStr()] || 0;
}
export function isOverLimit(profileId) {
  const lim = getKidLimit(profileId);
  if (!lim) return false;
  return getTodaySec(profileId) >= lim * 60;
}
export function weekReport(profileId) {
  const p = read(STATS_KEY, {})[profileId] || { days: {}, top: {} };
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayStr(d);
    out.push({ date: k, sec: p.days[k] || 0 });
  }
  const top = Object.entries(p.top || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { days: out, total: out.reduce((a, x) => a + x.sec, 0), top };
}
export function fmtDur(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return `${m}′`;
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}′` : ''}`;
}

// ---- PIN mở app (băm SHA-256 + salt cục bộ) ----
async function shaHex(s) {
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('chrtv-pin|' + s));
    return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch { return 'x' + s; }
}
export function hasAppPin() {
  try { return !!localStorage.getItem(PIN_KEY); } catch { return false; }
}
export async function setAppPin(pin) {
  const p = String(pin || '').replace(/\D/g, '').slice(0, 8);
  if (p.length < 4) return false;
  try { localStorage.setItem(PIN_KEY, await shaHex(p)); return true; } catch { return false; }
}
export function clearAppPin() {
  try { localStorage.removeItem(PIN_KEY); } catch {}
}
export async function verifyAppPin(pin) {
  try {
    const h = localStorage.getItem(PIN_KEY);
    if (!h) return true;
    return h === (await shaHex(String(pin || '')));
  } catch { return false; }
}
