import { API_BASE } from "./config";

// ===== GÓI CƯỚC CHRTV PLAY — tạm thời FREE toàn bộ =====
// standard     : các kênh VTV/TH + XEM THỬ mọi kênh khác 5 phút mỗi giờ
//                (hết 5 phút thì chỉ còn kênh TH — server chốt, xem worker previewState)
// QUẢNG CÁO pre-roll: standard 30s · recreational 10s · ultimate 5s · elite/signature không có
//                     tối đa 5 lần/giờ mỗi người xem
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
    allows: ["Kênh VTV / Truyền hình Việt", "Shorts", "Xem thử kênh khác 5 phút mỗi giờ"],
    allows_en: ["VTV / Vietnam TV channels", "Shorts", "5-minute preview of other channels"],
    not: [],
    not_en: [],
  },
  {
    code: "recreational", name: "RECREATIONAL", rank: 2,
    tagline: "VTV + BOX Giải trí", tagline_en: "VTV + BOX Entertainment", color: "#ab47bc",
    art: "🎬", grad: "linear-gradient(135deg,#581c87,#a855f7 55%,#e879f9)",
    allows: ["Kênh VTV / Truyền hình Việt", "Kênh BOX - Giải trí", "Shorts"],
    allows_en: ["VTV / Vietnam TV channels", "BOX entertainment channels", "Shorts"],
    not: [],
    not_en: [],
  },
  {
    code: "ultimate", name: "ULTIMATE", rank: 3,
    tagline: "VTV + BOX + Thể thao", tagline_en: "VTV + BOX + Sports", color: "#22c55e",
    art: "⚽", grad: "linear-gradient(135deg,#14532d,#16a34a 55%,#4ade80)",
    allows: ["Kênh VTV / Truyền hình Việt", "Kênh BOX - Giải trí", "Kênh Thể thao", "Shorts"],
    allows_en: ["VTV / Vietnam TV channels", "BOX entertainment channels", "Sports channels", "Shorts"],
    not: [],
    not_en: [],
  },
  {
    code: "elite", name: "ELITE", rank: 4,
    tagline: "Thêm kênh Phim", tagline_en: "Plus Movie channels", color: "#f59e0b",
    art: "🎞️", grad: "linear-gradient(135deg,#78350f,#d97706 55%,#fbbf24)",
    allows: ["Kênh VTV / Truyền hình Việt", "Kênh BOX - Giải trí", "Kênh Thể thao", "Kênh Phim", "Shorts", "Bỏ qua quảng cáo"],
    allows_en: ["VTV / Vietnam TV channels", "BOX entertainment channels", "Sports channels", "Movie channels", "Shorts", "Skip ads"],
    not: [],
    not_en: [],
  },
  {
    code: "signature", name: "SIGNATURE", rank: 5,
    tagline: "Tất cả mọi kênh", tagline_en: "Every single channel", color: "#f36f21",
    art: "👑", grad: "linear-gradient(135deg,#7c2d12,#f36f21 55%,#fbbf24)",
    allows: ["Kênh VTV / Truyền hình Việt", "Kênh BOX - Giải trí", "Kênh Thể thao", "Kênh Phim", "Mọi kênh hiện tại & tương lai", "Shorts", "Bỏ qua quảng cáo", "Hỗ trợ ưu tiên 24/7"],
    allows_en: ["VTV / Vietnam TV channels", "BOX entertainment channels", "Sports channels", "Movie channels", "All current & future channels", "Shorts", "Skip ads", "Priority 24/7 support"],
    not: [],
    not_en: [],
  },
];

// Rank mặc định khi chưa sync server (admin thêm gói mới vẫn phân quyền đúng theo rank)
export const PLAN_RANK_FALLBACK = { signature: 5, elite: 4, ultimate: 3, recreational: 2, standard: 1, vip: 5 };

export function planByCode(code) { return PLANS.find((p) => p.code === (code || "").toLowerCase()) || null; }

// Hàng so sánh cố định: kênh mở được + tính năng (không liệt kê “toàn bộ gói X”)
export const PLAN_FEATURES = [
  { id: 'vtv', minRank: 1, vi: 'Kênh VTV / Truyền hình Việt', en: 'VTV / Vietnam TV' },
  { id: 'box', minRank: 2, vi: 'Kênh BOX - Giải trí', en: 'BOX entertainment' },
  { id: 'sport', minRank: 3, vi: 'Kênh Thể thao', en: 'Sports channels' },
  { id: 'film', minRank: 4, vi: 'Kênh Phim', en: 'Movie channels' },
  { id: 'all', minRank: 5, vi: 'Mọi kênh hiện tại & tương lai', en: 'All current & future channels' },
  { id: 'shorts', minRank: 1, vi: 'Shorts', en: 'Shorts' },
  { id: 'skip_ads', minRank: 4, vi: 'Bỏ qua quảng cáo', en: 'Skip ads' },
  { id: 'support', minRank: 5, vi: 'Hỗ trợ ưu tiên 24/7', en: 'Priority 24/7 support' },
];

export function planHasFeature(planOrRank, featureId) {
  const rank = typeof planOrRank === 'number'
    ? planOrRank
    : (Number(planOrRank?.rank) || rankOf(planOrRank?.code || planOrRank));
  const f = PLAN_FEATURES.find((x) => x.id === featureId);
  return !!f && rank >= f.minRank;
}

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
