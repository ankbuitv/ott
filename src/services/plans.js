import { API_BASE } from "./config";

// ===== GÓI CƯỚC CHRTV — tạm thời FREE toàn bộ =====
// standard     : chỉ kênh truyền hình Việt Nam
// recreational : kênh VN + kênh Phim
// vip          : tất cả (VN + Phim + Thể thao + Quốc tế)
export const SUPPORT_EMAIL = "support@ankb.qzz.io";

export const PLANS = [
  {
    code: "standard", name: "STANDARD", rank: 1,
    tagline: "Kênh Việt Nam", color: "#42a5f5",
    allows: ["Kênh truyền hình Việt Nam (VTV, HTV, THVL, SCTV...)"],
    not: ["Kênh Phim", "Kênh Thể thao & Quốc tế"],
  },
  {
    code: "recreational", name: "RECREATIONAL", rank: 2,
    tagline: "Kênh VN + Kênh Phim", color: "#ab47bc",
    allows: ["Toàn bộ kênh Việt Nam", "Các kênh Phim (Hollywood Classics...)"],
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

const VN_RE = /(vtv|htv|thvl|sctv|antv|quốc gia|nhân dân|quốc hội|truyền hình việt nam|địa phương|hà nội|vĩnh long|cần thơ|vietnam|\bvn\b|nông nghiệp|phổ thông|dân tộc)/i;
const PHIM_RE = /(phim|movie|cinema|film|hollywood|classic|series|drama)/i;

// Phân loại kênh theo group_title: 'VN' | 'PHIM' | 'KHAC' (quốc tế/thể thao/khác)
export function classifyGroup(groupTitle = "") {
  const g = String(groupTitle || "");
  if (PHIM_RE.test(g)) return "PHIM";
  if (VN_RE.test(g)) return "VN";
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
