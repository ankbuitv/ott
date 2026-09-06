/**
 * Chống spoiler tỉ số: khi bật (chrtv_settings.spoilerMask), tỉ số dạng "2-1"
 * trong tên chương trình sẽ bị che thành "?-?" (không che giờ "19:00").
 */

export function spoilerOn() {
  try {
    const raw = localStorage.getItem('chrtv_settings');
    if (!raw) return false;
    return !!JSON.parse(raw)?.spoilerMask;
  } catch {
    return false;
  }
}

export function maskScores(title) {
  const s = String(title || '');
  if (!s || !spoilerOn()) return s;
  // Chỉ che với dấu gạch ngang (tỉ số), giữ nguyên giờ giấc có dấu ":"
  return s.replace(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/g, '?-?');
}
