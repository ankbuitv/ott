/**
 * CHRTV - Nguồn phát phim thứ 3 (embed APIs)
 *
 * Vidbox và các site tương tự không có API công khai — chúng nhúng nguồn
 * phát từ các embed API kiểu "vidsrc" nhận IMDb/TMDB ID và trả về player
 * HLS trực tiếp. App dùng chính các nguồn đó: chỉ cần TMDB ID là phát được
 * phim thật (nhiều server để dự phòng khi 1 server sập).
 *
 * Bộ nguồn này được đồng bộ theo danh sách nguồn mà CinemaOS (cinemaos.live)
 * đang dùng (lấy từ bundle JS watch page của họ) — gồm các nguồn "sạch"
 * ít/không quảng cáo xếp đầu (Videasy, VidFast, Vidzee, Rive, Ember,
 * Sapphire, Vertex, Nexus, Horizon, NontonGo, 7xtream, Uira, Spencer,
 * VidsrcMulti...) và các nguồn dự phòng phía dưới.
 *
 * Lưu ý: các domain này có thể đổi/rotating. Nếu hết server hoạt động, thêm
 * domain mới vào đây — app tự hiển thị danh sách server để người xem chọn.
 */

/**
 * Xây danh sách nguồn phát cho một phim/TV show.
 *
 * Thứ tự ưu tiên: nguồn "sạch" (adFree=true) xếp LÊN ĐẦU — ít/không QC,
 * chịu được sandbox. Nguồn dự phòng nhiều QC để cuối danh sách.
 *
 * @param {Object} movie - object TMDB (id, media_type, title/name)
 * @param {number} [season] - chỉ dùng cho TV show
 * @param {number} [episode] - chỉ dùng cho TV show
 * @returns {Array<{name:string, url:string, adFree?:boolean}>}
 */
export function buildEmbedSources(movie, season, episode) {
  // BẢO MẬT 2026-09-05 (P3): tắt toàn bộ nguồn embed API bên thứ 3
  // (vidsrc/cinemaos group) — KHÔNG có bản quyền, là vector pháp lý +
  // vector bảo mật (third-party iframe). Chỉ bật lại nguồn ĐÃ CÓ HỢP ĐỒNG
  // BẢN QUYỀN ở đây; UI tự hiển thị thông báo khi danh sách rỗng.
  return [];
}


/** Link tìm phim đó trên các nguồn mở (dự phòng cuối cùng) */
export function openExternalSearch(movie) {
  const q = encodeURIComponent((movie.title || movie.name || '') + ' full movie');
  window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener');
}
