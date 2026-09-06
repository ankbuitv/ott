// Cầu nối giữa nơi mở kênh/phim và màn quảng cáo pre-roll đặt ở App.
// App đăng ký handler một lần; mọi chỗ khác chỉ cần `await runPreroll('movie', id)`.
let handler = null;

export function setPrerollHandler(fn) { handler = fn; }

export async function runPreroll(kind = 'channel', ref = '') {
  if (!handler) return;
  try { await handler(kind, ref); } catch {}
}
