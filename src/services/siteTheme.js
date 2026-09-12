// Trang trí theo chủ đề (site-wide) — public /api/themes → active theme
// Cache 2 phút, lưu localStorage để F5 vẫn có ngay.

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const LS_KEY = "chrtv_active_theme_v1";
const LS_TS = "chrtv_active_theme_ts";
const TTL_MS = 2 * 60 * 1000;

function api(path) {
  const base = API_BASE ? `${API_BASE}` : "";
  return `${base}${path}`;
}

function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const ts = parseInt(localStorage.getItem(LS_TS) || "0", 10);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const fresh = Date.now() - ts < TTL_MS;
    return { theme: obj, fresh, ts };
  } catch { return null; }
}

function writeCache(theme) {
  try {
    if (theme) {
      localStorage.setItem(LS_KEY, JSON.stringify(theme));
      localStorage.setItem(LS_TS, String(Date.now()));
    } else {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_TS);
    }
    try { window.dispatchEvent(new CustomEvent("chrtv-theme-change", { detail: theme || null })); } catch {}
  } catch {}
}

export async function fetchActiveTheme({ force = false } = {}) {
  const cached = readCache();
  if (!force && cached && cached.fresh && cached.theme) return cached.theme;

  try {
    const r = await fetch(api("/api/themes"), { headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (j && j.success) {
      const active = j.active || (Array.isArray(j.themes) && j.themes[0]) || null;
      writeCache(active);
      return active;
    }
  } catch {}
  // fallback to stale cache
  if (cached && cached.theme) return cached.theme;
  return null;
}

export function clearThemeCache() {
  writeCache(null);
}

// Presets cho admin nhanh tay (FIFA ASEAN Cup v.v.)
export const THEME_PRESETS = [
  {
    key: "fifa-asean-cup-2026",
    name: "FIFA ASEAN Cup 2026",
    emoji: "🏆",
    description: "Giải vô địch bóng đá ASEAN — trang trí cúp vàng, cờ các nước",
    primary_color: "#0e7a3a",
    secondary_color: "#0b1d12",
    accent_color: "#ffd700",
    confetti: "trophy",
    banner_url: "",
    background_url: "",
  },
  {
    key: "tet-2026",
    name: "Tết Nguyên Đán 2026",
    emoji: "🧧",
    description: "Chúc mừng năm mới — mai vàng, pháo hoa",
    primary_color: "#c62828",
    secondary_color: "#1a0a0a",
    accent_color: "#ffb300",
    confetti: "fireworks",
  },
  {
    key: "noel-2025",
    name: "Giáng Sinh 2025",
    emoji: "🎄",
    description: "Merry Christmas — tuyết rơi, cây thông",
    primary_color: "#1b5e20",
    secondary_color: "#0d1b12",
    accent_color: "#ff5252",
    confetti: "snow",
  },
  {
    key: "euro-2028",
    name: "EURO 2028",
    emoji: "⚽",
    description: "Vòng chung kết EURO",
    primary_color: "#0d47a1",
    secondary_color: "#0a1628",
    accent_color: "#ffeb3b",
    confetti: "ball",
  },
  {
    key: "worldcup-2026",
    name: "FIFA World Cup 2026",
    emoji: "🌍",
    description: "Ngày hội bóng đá lớn nhất hành tinh",
    primary_color: "#1a237e",
    secondary_color: "#0e0e1a",
    accent_color: "#ff6f00",
    confetti: "trophy",
  },
  {
    key: "halloween",
    name: "Halloween",
    emoji: "🎃",
    description: "Lễ hội ma quái",
    primary_color: "#ef6c00",
    secondary_color: "#1a0f0a",
    accent_color: "#ab47bc",
    confetti: "pumpkin",
  },
];
