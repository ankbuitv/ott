import { API_BASE } from "./config";

// ===== GÓI CƯỚC CHRTV PLAY — tạm thời FREE toàn bộ =====
// standard     : các kênh VTV (nhóm "TH - Truyền hình Việt")
// recreational : + BOX - Giải trí
// ultimate     : + SPORTS - Thể thao
// elite        : + kênh Phim (phim/movie)
// signature    : tất cả mọi kênh
// Shorts xem miễn phí mọi gói (không gating)
export const SUPPORT_EMAIL = "support@ankb.qzz.io";

// art/grad: hình minh hoạ cho thẻ gói (PlansScreen)
export const PLANS = [
  {
    code: "standard", name: "STANDARD", rank: 1,
    tagline: "Các kênh VTV", tagline_en: "VTV channels", color: "#42a5f5",
    art: "📺", grad: "linear-gradient(135deg,#0c4a6e,#0284c7 55%,#38bdf8)",
    allows: ["Các kênh VTV (VTV1, VTV2, VTV3...)", "Shorts xem miễn phí"],
    allows_en: ["VTV channels (VTV1, VTV2, VTV3...)", "Free Shorts"],
    not: ["Kênh BOX - Giải trí", "Kênh Thể thao", "Kênh Phim"],
    not_en: ["BOX - Entertainment", "Sports channels", "Movie channels"],
  },
  {
    code: "recreational", name: "RECREATIONAL", rank: 2,
    tagline: "VTV + BOX Giải trí", tagline_en: "VTV + BOX Entertainment", color: "#ab47bc",
    art: "🎬", grad: "linear-gradient(135deg,#581c87,#a855f7 55%,#e879f9)",
    allows: ["Toàn bộ gói Standard", "38 kênh BOX - Giải trí", "Kênh thiếu nhi"],
    allows_en: ["Everything in Standard", "38 BOX - Entertainment channels", "Kids channels"],
    not: ["Kênh Thể thao", "Kênh Phim"],
    not_en: ["Sports channels", "Movie channels"],
  },
  {
    code: "ultimate", name: "ULTIMATE", rank: 3,
    tagline: "VTV + BOX + Thể thao", tagline_en: "VTV + BOX + Sports", color: "#22c55e",
    art: "⚽", grad: "linear-gradient(135deg,#14532d,#16a34a 55%,#4ade80)",
    allows: ["Toàn bộ gói Recreational", "19 kênh SPORTS - Thể thao"],
    allows_en: ["Everything in Recreational", "19 SPORTS channels"],
    not: ["Kênh Phim"],
    not_en: ["Movie channels"],
  },
  {
    code: "elite", name: "ELITE", rank: 4,
    tagline: "Thêm kênh Phim", tagline_en: "Plus Movie channels", color: "#f59e0b",
    art: "🎞️", grad: "linear-gradient(135deg,#78350f,#d97706 55%,#fbbf24)",
    allows: ["Toàn bộ gói Ultimate", "Các kênh Phim (phim / movie)"],
    allows_en: ["Everything in Ultimate", "Movie channels (phim / movie)"],
    not: ["Kênh đặc biệt mới"],
    not_en: ["New special channels"],
  },
  {
    code: "signature", name: "SIGNATURE", rank: 5,
    tagline: "Tất cả mọi kênh", tagline_en: "Every single channel", color: "#f36f21",
    art: "👑", grad: "linear-gradient(135deg,#7c2d12,#f36f21 55%,#fbbf24)",
    allows: ["Toàn bộ gói Elite", "Mọi kênh hiện tại & tương lai", "Ưu tiên hỗ trợ 24/7"],
    allows_en: ["Everything in Elite", "All current & future channels", "Priority 24/7 support"],
    not: [],
    not_en: [],
  },
];

// Rank mặc định khi chưa sync server (admin thêm gói mới vẫn phân quyền đúng theo rank)
export const PLAN_RANK_FALLBACK = { signature: 5, elite: 4, ultimate: 3, recreational: 2, standard: 1, vip: 5 };

export function planByCode(code) { return PLANS.find((p) => p.code === (code || "").toLowerCase()) || null; }

// Chuẩn hoá chuỗi nhóm để so sánh không dấu + thường
function normGroup(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Phân loại kênh theo group_title: 'VTV' | 'BOX' | 'SPORT' | 'FILM' | 'OTHER'
// Khớp với playlist thực tế:
//   "TH - Truyền hình Việt" -> VTV | "BOX - Giải trí" -> BOX | "SPORTS - Thể thao" -> SPORT
// (giữ đồng bộ 1:1 với classifyGroupChrtv trong worker/worker.js)
export function classifyGroup(groupTitle = "") {
  const g = normGroup(groupTitle);
  if (!g) return "VTV"; // nhóm trống = FTA mặc định
  if (/\b(th\s*truyen\s*hinh\s*viet|truyen\s*hinh\s*viet)\b/.test(g)) return "VTV";
  if (/\bvtv\w*/.test(g)) return "VTV";
  if (/\bbox\b/.test(g)) return "BOX";
  if (/(\bsport|the\s*thao|bong\s*da|\bespn\b|\bbein\b)/.test(g)) return "SPORT";
  if (/(phim|movie|cinema|film|hollywood|classic|series|drama|\bhbo\b|\baxn\b|warner|cinemax|discovery|nat\s*geo)/.test(g)) return "FILM";
  if (/(cartoon|\banim\b|\bkids\b|thieu\s*nhi|giai\s*tri)/.test(g)) return "BOX";
  return "OTHER";
}

// Rank gói (cache từ server — admin thêm gói mới vẫn phân quyền đúng)
const _rankCache = { at: 0, map: { ...PLAN_RANK_FALLBACK } };
export function rankOf(plan) {
  const c = String(plan || "standard").toLowerCase();
  return _rankCache.map[c] ?? (PLAN_RANK_FALLBACK[c] || 1);
}
export function refreshPlanRanks(plans) {
  const list = Array.isArray(plans) ? plans : Object.values(plans || {});
  if (!list.length) return;
  const m = { ...PLAN_RANK_FALLBACK };
  for (const p of list) {
    if (p?.code) m[String(p.code).toLowerCase()] = Number(p.rank) || 1;
  }
  _rankCache.at = Date.now();
  _rankCache.map = m;
}

// Danh sách gói đang bán (admin quản lý) — null khi offline
export async function fetchPlanList() {
  try {
    const res = await fetch(`${API_BASE}/api/plans`);
    if (!res.ok) return null;
    const d = await res.json();
    if (d?.success && Array.isArray(d.plans) && d.plans.length) {
      refreshPlanRanks(d.plans);
      return d.plans;
    }
    return null;
  } catch { return null; }
}

// Gói hiện có được xem nhóm kênh nào không (theo rank)
export function planAllows(plan, groupTitle = "") {
  const rank = rankOf(plan);
  if (rank >= 5) return true;
  const cls = classifyGroup(groupTitle);
  if (rank >= 4) return cls === "VTV" || cls === "BOX" || cls === "SPORT" || cls === "FILM";
  if (rank === 3) return cls === "VTV" || cls === "BOX" || cls === "SPORT";
  if (rank === 2) return cls === "VTV" || cls === "BOX";
  return cls === "VTV"; // rank 1 / mặc định
}

// Gói tối thiểu để xem 1 nhóm kênh (dùng cho thông báo nâng cấp)
export function minPlanForGroup(groupTitle = "") {
  const cls = classifyGroup(groupTitle);
  if (cls === "VTV") return "standard";
  if (cls === "BOX") return "recreational";
  if (cls === "SPORT") return "ultimate";
  if (cls === "FILM") return "elite";
  return "signature";
}

function authHeaders() {
  try {
    const raw = localStorage.getItem("chrtv_token");
    const token = raw ? JSON.parse(raw) : "";
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  } catch { return { "Content-Type": "application/json" }; }
}

export async function fetchPlan() {
  try {
    const res = await fetch(`${API_BASE}/user/plan`, { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function activatePlan(code) {
  try {
    const res = await fetch(`${API_BASE}/user/plan/activate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ plan: code }),
    });
    return await res.json();
  } catch { return { success: false, error: "Lỗi mạng" }; }
}
