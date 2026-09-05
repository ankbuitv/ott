/**
 * Web Push (VAPID) — đăng ký nhận thông báo đẩy từ Worker.
 * Push không payload: SW nhận sự kiện push → tự fetch /api/notifications lấy nội dung mới.
 */
import { API_BASE } from './config';

const SUB_KEY = 'chrtv_push_subscription';

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function isPushEnabled() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    return !!sub;
  } catch { return false; }
}

/** Xin quyền + đăng ký subscription + gửi lên server. Trả {ok, reason?} */
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'Trình duyệt không hỗ trợ Web Push.' };
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'Bạn đã chặn quyền thông báo.' };

  // 1) Lấy public key VAPID từ worker
  let publicKey = '';
  try {
    const res = await fetch(`${API_BASE}/api/push/vapid-public`);
    const data = await res.json();
    publicKey = data.publicKey || '';
  } catch {}
  if (!publicKey) return { ok: false, reason: 'Server chưa hỗ trợ push (cần deploy lại Worker + D1).' };

  // 2) Đăng ký service worker + subscription
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    });
  }

  // 3) Gửi subscription lên server
  const raw = sub.toJSON();
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: raw.keys }),
  });
  if (!res.ok) return { ok: false, reason: 'Server từ chối subscription.' };

  try { localStorage.setItem(SUB_KEY, JSON.stringify(raw)); } catch {}
  return { ok: true };
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(`${API_BASE}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
    localStorage.removeItem(SUB_KEY);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'Lỗi hủy đăng ký' };
  }
}
