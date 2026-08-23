/**
 * Cấu hình endpoint API dùng chung cho toàn app.
 *
 * Quy tắc chọn base URL (theo thứ tự ưu tiên):
 *   1. VITE_API_BASE  — build-time env (dùng khi web và Worker khác domain)
 *   2. localStorage `chrtv_api_base` — cho phép đổi nóng khi debug / APK trỏ server khác
 *   3. Same-origin ("")  — web được chính Cloudflare Worker phục vụ (dist/ + /api/*)
 *      => gọi API bằng đường dẫn tương đối, không lo CORS, không phụ thuộc domain cũ.
 *   4. PRODUCTION_API_BASE — app native (Capacitor: capacitor://, file://) không có origin HTTP
 *
 * Trước đây mỗi file hardcode một domain khác nhau (AdminPanel dùng same-origin,
 * AuthContext/ProfileContext/api.js dùng workers.dev cũ) nên đăng ký/đăng nhập
 * bắn sang Worker cũ và fail. Giờ tất cả đều đi qua đây.
 */

// Domain production dùng cho app Android/TV (không chạy trên http/https origin)
export const PRODUCTION_API_BASE = 'https://play.ankb.qzz.io';

const ENV_BASE = (import.meta.env?.VITE_API_BASE || '').trim();

function readOverride() {
  try {
    const v = localStorage.getItem('chrtv_api_base');
    return v && v.trim() ? v.trim() : '';
  } catch {
    return '';
  }
}

function detectBase() {
  const raw = ENV_BASE || readOverride();
  if (raw) return raw.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol;
    // Web thường (kể cả vite dev server — dev server proxy /api,/auth,/user,/admin)
    if (proto === 'http:' || proto === 'https:') return '';
  }
  // Capacitor / WebView native
  return PRODUCTION_API_BASE;
}

export const API_BASE = detectBase();

/** Ghép base + path an toàn: apiUrl('/auth/login') */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

/** Cho phép người dùng/kỹ thuật đổi server API ngay trong app (cần reload). */
export function setApiBaseOverride(url) {
  try {
    if (url && url.trim()) localStorage.setItem('chrtv_api_base', url.trim());
    else localStorage.removeItem('chrtv_api_base');
  } catch {}
}
