import { API_BASE } from './config';
import { authHeaders } from './session';

// Nhắc xem chương trình — cần đăng nhập.
export async function getReminders() {
  try {
    const res = await fetch(`${API_BASE}/api/reminders`, {
      headers: { Accept: 'application/json', ...authHeaders() },
    });
    if (!res.ok) return [];
    const d = await res.json().catch(() => ({}));
    return d.reminders || [];
  } catch {
    return [];
  }
}

export async function addReminder({ channel_id, program_title, remind_at }) {
  const res = await fetch(`${API_BASE}/api/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ channel_id, program_title, remind_at }),
  });
  if (res.status === 401) throw Object.assign(new Error('login'), { code: 'LOGIN_REQUIRED' });
  if (!res.ok) throw new Error('remind_failed');
  return true;
}

export async function deleteReminder(id) {
  const res = await fetch(`${API_BASE}/api/reminders`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('delete_failed');
  return true;
}
