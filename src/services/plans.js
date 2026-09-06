import { API_BASE } from "./config";

// ===== GÓI CƯỚC CHRTV PLAY — tạm thời FREE toàn bộ =====
// standard     : chỉ kênh truyền hình Việt Nam (nhóm "TH - Truyền hình Việt" + VTV/HTV/...)
// recreational : kênh VN + kênh Phim/Giải trí (nhóm "BOX - Giải trí" / phim)
// vip          : tất cả (VN + Phim + Thể thao + Quốc tế)
export const SUPPORT_EMAIL = "support@ankb.qzz.io";

export const PLANS = [
  {
    code: "standard", name: "STANDARD", rank: 1,
    tagline: "Kênh Việt Nam", color: "#42a5f5",
    allows: ["Kênh truyền hình Việt Nam (VTV, HTV, THVL, SCTV...)"],
    not: ["Kênh Phim / Giải trí", "Kênh Thể thao & Quốc tế"],
  },
  {
    code: "recreational", name: "RECREATIONAL", rank: 2,
    tagline: "Kênh VN + Kênh Phim", color: "#ab47bc",
    allows: ["Toàn bộ kênh Việt Nam", "Các kênh Phim / Giải trí (BOX, HBO, AXN...)"],
    not: ["Kênh Thể thao & Quốc tế"],
  },
  {
    code: "vip", name: "VIP", rank: 3,
    tagline: "Xem hết — tất cả kênh", color: "#f36f21",
    allows: ["Toàn bộ kênh VN + Phim + Thể thao", "Kênh Quốc tế & đặc biệt", "Ưu tiên hỗ trợ 24/7"],
    not: [],
  },
];

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

// Phân loại kênh theo group_title: 'VN' | 'PHIM' | 'KHAC' (thể thao/quốc tế/khác)
// Khớp với playlist thực tế:
//   "TH - Truyền hình Việt" -> VN | "BOX - Giải trí"/phim -> PHIM | "SPORTS - Thể thao" -> KHAC
export function classifyGroup(groupTitle = "") {
  const raw = String(groupTitle || "");
  const g = normGroup(raw);
  if (!g) return "VN"; // nhóm trống = kênh VN mặc định (FTA)

  // PHIM / Giải trí — check trước vì tên kênh VN cũng có thể chứa "phim" (HTVC Phim...)
  // nhưng group "TH - Truyền hình Việt" phải luôn là VN.
  if (/\b(th\s*truyen\s*hinh\s*viet|truyen\s*hinh\s*viet)\b/.test(g)) return "VN";
  if (/(box|giai\s*tri|phim|movie|cinema|film|hollywood|classic|series|drama|hbo|axn|warner|cinemax|discovery|nat\s*geo|cartoon|anim|kids|thieu\s*nhi)/.test(g)) return "PHIM";

  // VN — tên nhóm hoặc mã đài Việt
  if (/(viet(\s*nam)?|\bvn\b|vtv|htv|thvl|sctv|vtc|vtvcab|antv|quoc\s*gia|nhan\s*dan|quoc\s*hoi|dia\s*phuong|ha\s*noi|vinh\s*long|can\s*tho|nong\s*nghiep|pho\s*thong|dan\s*toc|truyen\s*hinh|tong\s*hop|du\s*phong|fpt\s*su\s*kien)/.test(g)) return "VN";

  return "KHAC";
}

// Gói hiện có được xem nhóm kênh nào không
export function planAllows(plan, groupTitle = "") {
  const code = (plan || "standard").toLowerCase();
  if (code === "vip") return true;
  const cls = classifyGroup(groupTitle);
  if (code === "recreational") return cls === "VN" || cls === "PHIM";
  return cls === "VN"; // standard / mặc định
}

// Gói tối thiểu để xem 1 nhóm kênh (dùng cho thông báo nâng cấp)
export function minPlanForGroup(groupTitle = "") {
  const cls = classifyGroup(groupTitle);
  if (cls === "VN") return "standard";
  if (cls === "PHIM") return "recreational";
  return "vip";
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
