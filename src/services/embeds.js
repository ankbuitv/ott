/**
 * CHRTV - Nguồn phát phim thứ 3 (embed APIs)
 *
 * Vidbox và các site tương tự không có API công khai — chúng nhúng nguồn
 * phát từ các embed API kiểu "vidsrc" nhận IMDb/TMDB ID và trả về player
 * HLS trực tiếp. App dùng chính các nguồn đó: chỉ cần TMDB ID là phát được
 * phim thật (nhiều server để dự phòng khi 1 server sập).
 *
 * Lưu ý: các domain này có thể đổi/rotating. Nếu hết server hoạt động, thêm
 * domain mới vào đây — app tự hiển thị danh sách server để người xem chọn.
 */

/**
 * Xây danh sách nguồn phát cho một phim/TV show.
 *
 * Thứ tự ưu tiên: các nguồn có player riêng, ít/không quảng cáo (adFree=true)
 * được xếp LÊN ĐẦU — VidLink, Videasy, VidFast, Vidsrc.cc v2. Các nguồn cũ
 * nhiều quảng cáo (2embed, multiembed, vidsrc.fyi, vid-src.top, moviesapi...)
 * chỉ để dự phòng phía dưới.
 *
 * @param {Object} movie - object TMDB (id, media_type, title/name)
 * @param {number} [season] - chỉ dùng cho TV show
 * @param {number} [episode] - chỉ dùng cho TV show
 * @returns {Array<{name:string, url:string, adFree?:boolean}>}
 */
export function buildEmbedSources(movie, season, episode) {
  if (!movie || !movie.id) return [];
  const id = movie.id;
  const isTV = movie.media_type === 'tv';
  const se = season && episode ? `/${season}/${episode}` : '';
  const seQuery = season && episode ? `&s=${season}&e=${episode}` : '';

  const sources = [
    // --- Nguồn "sạch": player riêng, ít/không quảng cáo, chịu được sandbox ---
    { name: 'VidLink', adFree: true, url: isTV ? `https://vidlink.pro/tv/${id}${se}` : `https://vidlink.pro/movie/${id}` },
    { name: 'Videasy', adFree: true, url: isTV ? `https://player.videasy.net/tv/${id}${se}` : `https://player.videasy.net/movie/${id}` },
    { name: 'VidFast', adFree: true, url: isTV ? `https://vidfast.pro/tv/${id}${se}` : `https://vidfast.pro/movie/${id}` },
    { name: 'Vidsrc.cc', adFree: true, url: isTV ? `https://vidsrc.cc/v2/embed/tv/${id}${se}` : `https://vidsrc.cc/v2/embed/movie/${id}` },
    // --- Nguồn dự phòng: nhiều quảng cáo hơn, chỉ dùng khi các nguồn trên lỗi ---
    { name: 'Vidsrc.fyi', url: isTV ? `https://vidsrc.fyi/embed/tv/${id}${se}` : `https://vidsrc.fyi/embed/movie/${id}` },
    { name: 'Vid-src.top', url: isTV ? `https://vid-src.top/embed/tv/${id}${se}` : `https://vid-src.top/embed/movie/${id}` },
    { name: 'Vidsrc.me', url: isTV ? `https://vidsrcme.ru/embed/tv/${id}${se}` : `https://vidsrcme.ru/embed/movie/${id}` },
    { name: 'Vidsrc.hair', url: isTV ? `https://vidsrc.hair/embed/tv/${id}${se}` : `https://vidsrc.hair/embed/movie/${id}` },
    { name: 'Embed.su', url: isTV ? `https://embed.su/embed/tv/${id}${se}` : `https://embed.su/embed/movie/${id}` },
    { name: '2Embed', url: isTV ? `https://2embed.cc/embed/tv/${id}${se}` : `https://2embed.cc/embed/movie/${id}` },
    { name: 'MultiEmbed', url: `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1${seQuery}` },
    { name: 'MoviesAPI', url: `https://moviesapi.club/tmdb/${isTV ? 'tv' : 'movie'}/${id}` },
  ];
  return sources;
}

/** Link tìm phim đó trên các nguồn mở (dự phòng cuối cùng) */
export function openExternalSearch(movie) {
  const q = encodeURIComponent((movie.title || movie.name || '') + ' full movie');
  window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener');
}
