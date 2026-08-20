/**
 * CHRTV - Xử lý Thời gian & Định dạng EPG
 * Tác giả: CHRTV OTT Full-stack Architect
 */

/**
 * Chuyển chuỗi EPG timestamp (ví dụ "20260820200000 +0700" hoặc ISO) sang đối tượng Date
 */
export function parseEpgDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;

  // Xử lý chuỗi định dạng XMLTV YYYYMMDDHHMMSS [Z|offset]
  if (typeof dateStr === 'string' && /^\d{14}/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hour = parseInt(dateStr.substring(8, 10), 10);
    const minute = parseInt(dateStr.substring(10, 12), 10);
    const second = parseInt(dateStr.substring(12, 14), 10);

    return new Date(Date.UTC(year, month, day, hour - 7, minute, second)); // Múi giờ Việt Nam UTC+7
  }

  return new Date(dateStr);
}

/**
 * Định dạng thời gian dạng Giờ:Phút (ví dụ "20:30")
 */
export function formatTimeHHMM(dateInput) {
  const d = parseEpgDate(dateInput);
  if (isNaN(d.getTime())) return '--:--';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Định dạng Ngày/Tháng (ví dụ "Thứ 5, 20/08")
 */
export function formatDateVN(dateInput) {
  const d = parseEpgDate(dateInput);
  if (isNaN(d.getTime())) return '';
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayName = days[d.getDay()];
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${dayName}, ${day}/${month}`;
}

/**
 * Tính phần trăm tiến trình của chương trình đang phát (0% - 100%)
 */
export function calculateProgramProgress(startInput, stopInput) {
  const start = parseEpgDate(startInput).getTime();
  const stop = parseEpgDate(stopInput).getTime();
  const now = Date.now();

  if (now <= start) return 0;
  if (now >= stop) return 100;

  const total = stop - start;
  const elapsed = now - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}
