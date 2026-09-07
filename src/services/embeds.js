/**
 * CHRTV — danh sách nguồn phát cho mục Phim/TV show.
 *
 * LỊCH SỬ: trước đây file này hard-code ~50 domain embed kiểu "vidsrc".
 * Ngày 2026-09-05 (P3, xem SECURITY_FIX_RUNBOOK.md Phụ lục B) toàn bộ bị tắt vì
 * đó là nguồn KHÔNG có bản quyền và là vector bảo mật (iframe bên thứ 3).
 *
 * GIỜ danh sách lấy từ server (bảng `movie_sources`, admin quản lý ở
 * Admin Panel → Nguồn phim) và server CHỈ trả về nguồn mà domain của nó có trong
 * allowlist CSP `MOVIE_FRAME_SRC`. Nghĩa là:
 *   - thêm/bớt nguồn không cần build lại app;
 *   - nguồn ở domain chưa được duyệt bị lọc ngay ở server, nên không thể "nhét"
 *     qua DB rồi mong chạy;
 *   - không có nguồn nào = modal hiện "Chưa có nguồn phát hợp lệ" như cũ.
 *
 * Quy trình đúng: chỉ thêm nguồn mình CÓ HỢP ĐỒNG/QUYỀN PHÂN PHỐI, và ghi rõ
 * điều đó vào ô licence_note khi thêm (admin bắt buộc điền).
 */

import { API_BASE } from './config';

/**
 * @param {Object} movie  object TMDB (id, media_type)
 * @param {number} [season]
 * @param {number} [episode]
 * @returns {Promise<Array<{id:number,name:string,kind:'embed'|'hls',url:string}>>}
 */
export async function fetchMovieSources(movie, season, episode) {
  const id = movie?.id;
  if (!id) return [];
  const type = movie.media_type === 'tv' ? 'tv' : 'movie';
  const q = new URLSearchParams({ tmdb: String(id), type });
  if (type === 'tv') {
    q.set('season', String(season || 1));
    q.set('episode', String(episode || 1));
  }
  try {
    const res = await fetch(`${API_BASE}/api/movie/sources?${q}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.sources) ? data.sources : [];
  } catch {
    return []; // offline / worker chưa deploy: coi như không có nguồn
  }
}
