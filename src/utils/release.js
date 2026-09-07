/**
 * Trạng thái khởi chiếu của một phim/TV show, dựa trên dữ liệu TMDB đã có
 * trong object (KHÔNG cần thêm request API — list/search đều trả release_date,
 * first_air_date, status).
 *
 * Mục đích: app không được hứa "Xem phim" cho thứ chưa tồn tại. Harry Potter
 * (HBO) là ví dụ điển hình — TMDB đưa lên trending từ trước khi khởi chiếu,
 * user bấm vào là gặp màn trống.
 */

const PLANNED_STATUS = new Set(['Planned', 'Rumored', 'In Production', 'Post Production', 'Production']);

/** '2026-12-25' -> '25/12/2026' (TMDB luôn trả YYYY-MM-DD) */
export function fmtDateVi(iso) {
  const s = String(iso || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s ? s.slice(0, 10) : '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * @param {Object} movie object TMDB (release_date | first_air_date | status)
 * @returns {{released:boolean, known:boolean, date:string, dateLabel:string, year:string}}
 *   - released=true  : đã khởi chiếu (hoặc TMDB không cho ngày -> mặc định coi là đã chiếu)
 *   - known=false    : TMDB không có ngày AND status không phải planned (ẩn ngày, không đoán)
 */
export function releaseState(movie) {
  const date = String(movie?.release_date || movie?.first_air_date || '');
  const status = String(movie?.status || '');
  if (date) {
    // So với 00:00 của ngày chiếu (giờ máy người xem): phim đề ngày HÔM NAY được coi
    // là đã chiếu (đa nền phát từ nửa đêm), ngày MAI mới là "sắp chiếu".
    // Trước đây dùng 23:59 -> phim chiếu hôm nay vẫn bị gắn nhãn "Sắp chiếu" cả ngày.
    const d = new Date(`${date}T00:00:00`);
    const valid = !Number.isNaN(d.getTime());
    return {
      released: valid ? d.getTime() <= Date.now() : true,
      known: true,
      date,
      dateLabel: fmtDateVi(date),
      year: date.slice(0, 4),
    };
  }
  if (PLANNED_STATUS.has(status)) {
    return { released: false, known: false, date: '', dateLabel: '', year: '' };
  }
  return { released: true, known: false, date: '', dateLabel: '', year: '' };
}
