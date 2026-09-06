import { API_BASE } from './config';
import { authHeaders } from './session';

// Đánh giá kênh (1-5 sao) — cần đăng nhập. GET trả { avg, count, userRating }.
export async function getRating(channelId) {
  try {
    const res = await fetch(`${API_BASE}/api/rating?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { Accept: 'application/json', ...authHeaders() },
    });
    if (!res.ok) return { avg: 0, count: 0, userRating: 0 };
    const d = await res.json().catch(() => ({}));
    return { avg: Number(d.avg || 0), count: Number(d.count || 0), userRating: Number(d.userRating || 0) };
  } catch {
    return { avg: 0, count: 0, userRating: 0 };
  }
}

export async function postRating(channelId, rating) {
  const r = Math.max(1, Math.min(5, Number(rating) || 0));
  if (!r) throw new Error('rating');
  const res = await fetch(`${API_BASE}/api/rating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ channel_id: channelId, rating: r }),
  });
  if (res.status === 401) throw Object.assign(new Error('login'), { code: 'LOGIN_REQUIRED' });
  if (!res.ok) throw new Error('rate_failed');
  return true;
}
