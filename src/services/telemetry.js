// Telemetry & báo lỗi kênh (tính năng 20 + 49).
// - reportChannel(): người xem bấm "Báo kênh lỗi" -> /api/report-channel
// - logPlayerError(): player tự gửi mã lỗi hls.js/shaka -> /api/telemetry/player
// Cả hai đều "bắn rồi quên": lỗi mạng không bao giờ làm hỏng trải nghiệm xem.
import { API_BASE } from './config';
import { authHeaders } from './session';

export const REPORT_CODES = [
  { code: 'no_play', label: 'Không phát được' },
  { code: 'buffering', label: 'Giật / quay vòng liên tục' },
  { code: 'no_audio', label: 'Mất tiếng' },
  { code: 'wrong_program', label: 'Sai chương trình / sai kênh' },
  { code: 'bad_quality', label: 'Hình mờ, vỡ nét' },
  { code: 'other', label: 'Lỗi khác' },
];

function post(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify(body || {}),
  }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
}

export function reportChannel({ channel, code = 'other', note = '' }) {
  if (!channel) return Promise.resolve({});
  return post('/api/report-channel', {
    channel_id: channel.channel_id,
    channel_name: channel.name || '',
    code,
    note,
  });
}

// Chống spam: mỗi (kênh + mã lỗi) chỉ gửi 1 lần / 2 phút, tối đa 20 lần mỗi phiên.
const sent = new Map();
let budget = 20;
export function logPlayerError({ channel, engine = 'hls', code = 'unknown', detail = '', fatal = false }) {
  try {
    if (budget <= 0) return;
    const key = `${channel?.channel_id || '-'}|${code}`;
    const now = Date.now();
    if (now - (sent.get(key) || 0) < 120000) return;
    sent.set(key, now);
    budget -= 1;
    post('/api/telemetry/player', {
      channel_id: channel?.channel_id || '',
      channel_name: channel?.name || '',
      engine,
      code: String(code).slice(0, 60),
      detail: String(detail || '').slice(0, 300),
      fatal: !!fatal,
      platform: `${navigator.platform || ''} ${navigator.userAgent || ''}`.slice(0, 60),
    });
  } catch {}
}

// Trạng thái hệ thống (tính năng 47) — dùng cho trang /status và badge trong app.
export function fetchSystemStatus() {
  return fetch(`${API_BASE}/api/status`, { headers: { Accept: 'application/json' } })
    .then(r => r.json())
    .catch(() => null);
}
