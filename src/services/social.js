// Client gọi API social/thống kê/thương mại (worker): beat, top, comments,
// fan groups, profile công khai, predictions, gifts, payments, ads.
import { API_BASE } from './config';
import { authHeaders, hasUserToken } from './session';

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || 'API_ERROR'), { code: j.error, status: res.status });
  return j;
}
const get = (p) => req(p);
const post = (p, b) => req(p, { method: 'POST', body: b });
const put = (p, b) => req(p, { method: 'PUT', body: b });
const del = (p, b) => req(p, { method: 'DELETE', body: b });

// ---- Heartbeat xem (kênh/phim) — gửi mỗi 60s khi đang phát ----
const SID = (() => {
  try {
    let v = sessionStorage.getItem('chrtv_sid');
    if (!v) { v = 't' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('chrtv_sid', v); }
    return v;
  } catch { return 't' + Math.random().toString(36).slice(2, 10); }
})();
export function sendBeat({ kind, ref_id, ref_name, seconds = 60, viewed = false, name = '' }) {
  post('/api/stats/beat', { sid: SID, kind, ref_id, ref_name, seconds, viewed, name }).catch(() => {});
}
export const fetchTopChannels = () => get('/api/stats/top').then(d => d.top || []).catch(() => []);
// (3) "Đang hot": xếp hạng theo 15 phút gần nhất; rỗng thì gọi lại bảng tổng.
export const fetchTrendingChannels = () => get('/api/stats/trending').then(d => d.trending || []).catch(() => []);
export const fetchTopFans = () => get('/api/stats/top-fans').then(d => d.fans || []).catch(() => []);

// ---- Hồ sơ công khai ----
export const getMyProfile = () => req('/api/profile').then(d => d.profile).catch(() => null);
export const saveMyProfile = (p) => put('/api/profile', p);
export const fetchPublicProfile = (handle) => get(`/api/u?handle=${encodeURIComponent(handle)}`).then(d => d.profile);

// ---- Bình luận ----
export const fetchComments = (target) => get(`/api/comments?target=${encodeURIComponent(target)}`).then(d => d.comments || []).catch(() => []);
export const postComment = (target, body, extra = {}) => post('/api/comments', { target, body, ...extra });
export const deleteComment = (id) => del('/api/comments', { id });

// ---- Nhóm fan ----
export const fetchFanGroup = (target) => get(`/api/fan-groups?target=${encodeURIComponent(target)}`).catch(() => ({ group: null, members: [], joined: false }));
export const joinFanGroup = (target, name) => post('/api/fan-groups', { target, name });
export const leaveFanGroup = (target) => del('/api/fan-groups', { target });

// ---- Dự đoán ----
export const fetchPredict = (eventKey) => get(`/api/predictions?event=${encodeURIComponent(eventKey || '')}`).catch(() => ({ mine: null, board: [] }));
export const submitPredict = (p) => post('/api/predictions', p);

// ---- Gift / thanh toán / quảng cáo ----
export const redeemGift = (code) => post('/api/gifts/redeem', { code });
// Tặng gói quà kênh cho bạn bè: tạo mã quà (1 lần dùng, khoá tên người nhận nếu có)
export const createGift = (g) => post('/api/gifts/create', g);
export const fetchMyGifts = () => get('/api/gifts/mine').catch(() => ({ sent: [], received: [] }));
export const fetchPayConfig = () => get('/api/payments/config').catch(() => ({ config: null, plans: [] }));
export const createPayOrder = (plan) => post('/api/payments/order', { plan });
export const claimPayOrder = (order_code) => post('/api/payments/claim', { order_code });
export const fetchAds = (slot) => get(`/api/ads${slot ? `?slot=${encodeURIComponent(slot)}` : ''}`).then(d => d.ads || []).catch(() => []);

export { hasUserToken };
