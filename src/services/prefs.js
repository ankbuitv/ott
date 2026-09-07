// Sở thích cá nhân hoá (#61 quiz) + chủ đề theo mùa (#83) + theo dõi series mirror (#8)
// Lưu localStorage, đọc được ở mọi màn hình (Movies/Home/TV) để sắp xếp nội dung.
const K_PREFS = 'chrtv_home_prefs_v1';
const K_SEASON = 'chrtv_seasonal_theme_v1';

export const DEFAULT_PREFS = {
  // Câu 1: xem gì nhiều nhất — movies | tv | sports | shorts
  focus: 'movies',
  // Câu 2: nhóm kênh yêu thích (TVPage ưu tiên nhóm này lên đầu)
  favGroups: [],
  // Câu 3: điều gì quan trọng — quality | new | community
  value: 'quality',
  // genre ids yêu thích (rút ra từ câu 1 + để MoviesScreen ưu tiên)
  favGenres: [],
};

export function getHomePrefs() {
  try {
    const raw = localStorage.getItem(K_PREFS);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PREFS };
}
export function saveHomePrefs(p) {
  try { localStorage.setItem(K_PREFS, JSON.stringify({ ...DEFAULT_PREFS, ...p })); } catch {}
}

// ---------- (#83) chủ đề theo mùa ----------
export function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1; // 1..12
  if (m === 12 || m <= 2) return 'winter';   // 🎄
  if (m <= 5) return 'spring';                // 🌸
  if (m <= 8) return 'summer';                // ☀️
  return 'autumn';                            // 🍂
}
export const SEASON_META = {
  spring: { emoji: '🌸', vi: 'Mùa xuân', en: 'Spring', grad: ['#7ec8e3', '#86d99b'] },
  summer: { emoji: '☀️', vi: 'Mùa hè', en: 'Summer', grad: ['#f9b234', '#f36f21'] },
  autumn: { emoji: '🍂', vi: 'Mùa thu', en: 'Autumn', grad: ['#e8a13c', '#c2592f'] },
  winter: { emoji: '🎄', vi: 'Mùa đông', en: 'Winter', grad: ['#5ec5e8', '#3d7bd9'] },
};
export function seasonalThemeOn() {
  try { return localStorage.getItem(K_SEASON) !== '0'; } catch { return true; }
}
export function setSeasonalTheme(on) {
  try { localStorage.setItem(K_SEASON, on ? '1' : '0'); } catch {}
}
export function currentSeason() { return seasonalThemeOn() ? seasonOf() : null; }

// ---------- (#17) Thống kê dữ liệu đã dùng (ước lượng từ giây xem) ----------
const K_USAGE = 'chrtv_datausage_v1';
const MB_PER_SEC = { 480: 0.28, 720: 0.6, 1080: 1.1, other: 0.45 }; // ước lượng trung bình
export function addUsage(seconds, quality = 'other') {
  const mb = (Number(seconds) || 0) * (MB_PER_SEC[quality] !== undefined ? MB_PER_SEC[quality] : MB_PER_SEC.other);
  if (mb <= 0) return;
  const all = getUsageRaw();
  const today = new Date().toISOString().slice(0, 10);
  all.days[today] = (all.days[today] || 0) + mb;
  // chỉ giữ 35 ngày
  const keys = Object.keys(all.days).sort().slice(-35);
  all.days = Object.fromEntries(keys.map(k => [k, all.days[k]]));
  try { localStorage.setItem(K_USAGE, JSON.stringify(all)); } catch {}
}
export function getUsageRaw() {
  try { return JSON.parse(localStorage.getItem(K_USAGE) || '{}'); } catch {}
  return { days: {} };
}
export function getUsageWeek() {
  const all = getUsageRaw().days || {};
  const now = new Date();
  let mb = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    mb += all[d] || 0;
  }
  return Math.round(mb);
}
export function getUsageDay() {
  const d = new Date().toISOString().slice(0, 10);
  return Math.round((getUsageRaw().days || {})[d] || 0);
}
export const DATA_CAP_DEFAULT_MB = 3000; // mặc định 3GB/tháng cho cảnh báo

// Cảnh báo khi vượt cap (trả true nếu vượt) — gọi mỗi lần cộng dữ liệu
export function usageOverCap(capMb) {
  const mb = getUsageRaw().days || {};
  const month = new Date().toISOString().slice(0, 7);
  let total = 0;
  for (const k of Object.keys(mb)) if (k.startsWith(month)) total += mb[k];
  return total > (capMb || DATA_CAP_DEFAULT_MB);
}
