import { API_BASE } from "./config";

/**
 * Phiên đăng nhập dùng chung cho toàn app (P0-B):
 *  - User thật: JWT lưu localStorage (AuthContext).
 *  - Khách vãng lai: JWT guest ngắn hạn (2h) xin từ /auth/guest — không cần
 *    tài khoản, server coi là phiên hợp lệ ở mức gói Standard (kênh VN/FTA).
 *
 * Mọi request API nhạy cảm (stream token, EPG, favorites...) đều kèm JWT —
 * KHÔNG còn dùng header X-CHRTV-Client làm "xác thực" (chỉ là phiên bản client).
 */

let _guestToken = "";
let _guestExp = 0; // epoch giây

function userToken() {
  try {
    const raw = localStorage.getItem("chrtv_token");
    return raw ? JSON.parse(raw) : "";
  } catch {
    return "";
  }
}

/** Đảm bảo có phiên: user JWT (nếu đăng nhập) hoặc guest JWT (xin khi cần). */
export async function ensureSessionToken() {
  const u = userToken();
  if (u) return { token: u, guest: false };
  if (_guestToken && _guestExp * 1000 - 60 * 1000 > Date.now()) {
    return { token: _guestToken, guest: true };
  }
  try {
    const res = await fetch(`${API_BASE}/auth/guest`, { method: "POST" });
    if (res.ok) {
      const j = await res.json();
      if (j && j.token) {
        _guestToken = j.token;
        _guestExp = j.exp || 0;
        return { token: _guestToken, guest: true };
      }
    }
  } catch (e) {
    console.warn("Lấy guest token lỗi:", e?.message || e);
  }
  return { token: "", guest: true };
}

/** Headers auth (user hoặc guest) cho fetch API. */
export function authHeaders() {
  const u = userToken();
  if (u) return { Authorization: `Bearer ${u}` };
  return _guestToken ? { Authorization: `Bearer ${_guestToken}` } : {};
}

/** Lọc token đang dùng (bỏ cache guest khi user đăng nhập/đăng xuất). */
export function onAuthChanged() {
  _guestToken = "";
  _guestExp = 0;
}
