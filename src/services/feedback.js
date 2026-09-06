import { API_BASE } from './config';
import { authHeaders } from './session';

// Báo lỗi kênh 1 chạm — khách cũng gửi được (user_id = 0)
export async function sendFeedback({ channel_id, message, upstreamUA, program }) {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ channel_id, message, upstreamUA, program }),
  });
  if (!res.ok) throw new Error('feedback_failed');
  return true;
}
