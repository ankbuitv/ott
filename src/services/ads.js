// (34) Quảng cáo pre-roll + trạng thái "xem thử 5 phút" của gói Standard.
//
// Luật (server chốt, client chỉ hiển thị):
//   elite / signature -> không quảng cáo
//   ultimate 5s · recreational 10s · standard & khách 30s mới được bỏ qua
//   tối đa 5 quảng cáo mỗi giờ cho mỗi người xem
import { API_BASE } from './config';
import { authHeaders } from './session';

export async function fetchPreroll({ kind = 'channel', ref = '' } = {}) {
  try {
    const qs = new URLSearchParams({ kind, ref: ref || '' });
    const r = await fetch(`${API_BASE}/api/ads/preroll?${qs}`, {
      headers: { Accept: 'application/json', ...authHeaders() },
    });
    const d = await r.json().catch(() => ({}));
    return d && d.ad ? d : null;
  } catch { return null; }
}

export function reportAdImpression({ ad_id, ref_id = '', completed = false, seconds = 0 }) {
  try {
    fetch(`${API_BASE}/api/ads/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ad_id, ref_id, completed, seconds }),
    }).catch(() => {});
  } catch {}
}

// ---- Trạng thái xem thử (gói Standard: 5 phút/giờ cho kênh ngoài gói) ----
let previewState = { total: 300, used: 0, remaining: 300, resets_in: 0, enabled: false, loaded: false };
const listeners = new Set();

function emit() { listeners.forEach(fn => { try { fn(previewState); } catch {} }); }

export function getPreviewState() { return previewState; }
export function subscribePreview(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setPreviewState(patch) {
  previewState = { ...previewState, ...patch, loaded: true };
  emit();
}

export async function loadPreviewState() {
  try {
    const r = await fetch(`${API_BASE}/api/preview/state`, { headers: { Accept: 'application/json', ...authHeaders() } });
    if (!r.ok) return previewState;
    const d = await r.json();
    setPreviewState({
      total: d.total ?? 300,
      used: d.used ?? 0,
      remaining: d.remaining ?? 0,
      resets_in: d.resets_in ?? 0,
      enabled: !!d.preview_enabled,
    });
  } catch {}
  return previewState;
}

/** Gói Standard còn quota thì vẫn cho bấm vào kênh ngoài gói (server sẽ cấp 5 phút xem thử). */
export function canTryPreview() {
  return !!previewState.enabled && previewState.remaining > 0;
}

export function fmtPreview(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
