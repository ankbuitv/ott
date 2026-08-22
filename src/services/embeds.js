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
  if (!movie || !movie.id) return [];
  const id = movie.id;
  const isTV = movie.media_type === 'tv';
  const se = season && episode ? `/${season}/${episode}` : '';
  const seQuery = season && episode ? `&s=${season}&e=${episode}` : '';

  const sources = [
    // ============================================================
    // NGUỒN "SẠCH" — player riêng, ít/không quảng cáo (adFree)
    // (đồng bộ theo CinemaOS: nhóm premium + standard)
    // ============================================================
    { name: 'Videasy', adFree: true, url: isTV ? `https://player.videasy.net/tv/${id}${se}` : `https://player.videasy.net/movie/${id}?color=8834ec` },
    { name: 'VidFast', adFree: true, url: isTV ? `https://vidfast.pro/tv/${id}${se}` : `https://vidfast.pro/movie/${id}?autoPlay=true&title=true&poster=true&theme=16A085&nextButton=true&autoNext=true` },
    { name: 'Vidzee 4K', adFree: true, url: isTV ? `https://player.vidzee.wtf/embed/tv/4k/${id}${se}` : `https://player.vidzee.wtf/embed/movie/4k/${id}` },
    { name: 'Vidzee', adFree: true, url: isTV ? `https://player.vidzee.wtf/embed/tv/${id}${se}` : `https://player.vidzee.wtf/embed/movie/${id}` },
    { name: 'Vidzee Multi', adFree: true, url: isTV ? `https://player.vidzee.wtf/v2/embed/tv/${id}${se}` : `https://player.vidzee.wtf/v2/embed/movie/${id}` },
    { name: 'Vertex', adFree: true, url: isTV ? `https://filmuserver.netlify.app/embed/tv/${id}?s=${season}&e=${episode}` : `https://filmuserver.netlify.app/embed/movie/${id}` },
    { name: 'Ember', adFree: true, url: isTV ? `https://iframe.pstream.org/media/tmdb-tv-${id}-${season}-${episode}?theme=gray&language=en&logo=false&downloads=true&watchparty=true&lang-order=en,hi,fr,de,nl,pt&allinone=true` : `https://iframe.pstream.org/media/tmdb-movie-${id}?theme=gray&language=en&logo=false&downloads=true&watchparty=true&lang-order=en,hi,fr,de,nl,pt&allinone=true` },
    { name: 'RiveStream', adFree: true, url: isTV ? `https://rivestream.org/embed?type=tv&id=${id}${seQuery}` : `https://rivestream.org/embed?type=movie&id=${id}` },
    { name: 'Sapphire', adFree: true, url: isTV ? `https://embed.filmu.fun/media/tmdb-tv-${id}-${season}-${episode}` : `https://embed.filmu.fun/media/tmdb-movie-${id}` },
    { name: 'Nexus', adFree: true, url: isTV ? `https://flix.1ani.me/media/tmdb-tv-${id}-${season}-${episode}` : `https://flix.1ani.me/media/tmdb-movie-${id}` },
    { name: 'Horizon', adFree: true, url: isTV ? `https://backup.filmu.fun/watch/tv/${id}?season=${season}&episode=${episode}` : `https://backup.filmu.fun/watch/movie/${id}` },
    { name: 'NontonGo', adFree: true, url: isTV ? `https://www.nontongo.win/embed/tv/${id}${se}` : `https://www.nontongo.win/embed/movie/${id}` },
    { name: '7xtream', adFree: true, url: isTV ? `https://embed.7xtream.com/test/tv/${id}${se}` : `https://embed.7xtream.com/test/movie/${id}` },
    { name: 'Uira', adFree: true, url: isTV ? `https://6x3d4pm9r7k2v8h1q56.uira.live/embed/tv/${id}${se}` : `https://6x3d4pm9r7k2v8h1q56.uira.live/embed/movie/${id}` },
    { name: 'Spencer', adFree: true, url: isTV ? `https://spencerdevs.xyz/tv/${id}${se}` : `https://spencerdevs.xyz/movie/${id}` },
    { name: 'Vidsrc.cc', adFree: true, url: isTV ? `https://vidsrc.cc/v3/embed/tv/${id}${se}?autoPlay=false` : `https://vidsrc.cc/v3/embed/movie/${id}?autoPlay=false` },
    { name: 'VidSrcMulti', adFree: true, url: isTV ? `https://vidsrc.wtf/api/1/tv/?id=${id}${seQuery}&color=e01621` : `https://vidsrc.wtf/api/1/movie/?id=${id}&color=e01621` },
    { name: 'VidSrcMulti 2', adFree: true, url: isTV ? `https://vidsrc.wtf/api/2/tv/?id=${id}${seQuery}&color=e01621` : `https://vidsrc.wtf/api/2/movie/?id=${id}&color=e01621` },
    { name: 'VidSrcMulti 3', adFree: true, url: isTV ? `https://vidsrc.wtf/api/3/tv/?id=${id}${seQuery}&color=e01621` : `https://vidsrc.wtf/api/3/movie/?id=${id}&color=e01621` },
    { name: 'VidSrcMulti 4', adFree: true, url: isTV ? `https://vidsrc.wtf/api/4/tv/?id=${id}${seQuery}&color=e01621` : `https://vidsrc.wtf/api/4/movie/?id=${id}&color=e01621` },
    { name: 'Vidify', adFree: true, url: isTV ? `https://vidify.top/embed/tv/${id}${se}` : `https://vidify.top/embed/movie/${id}` },
    { name: 'AutoEmbed', adFree: true, url: isTV ? `https://player.autoembed.cc/embed/tv/${id}${se}` : `https://player.autoembed.cc/embed/movie/${id}` },
    { name: 'VidSrc', adFree: true, url: isTV ? `https://vidsrc.in/embed/tv/${id}${se}` : `https://vidsrc.in/embed/movie/${id}` },
    { name: 'VidStream', adFree: true, url: isTV ? `https://www.vidstream.site/embed/tv/${id}${se}` : `https://www.vidstream.site/embed/movie/${id}` },
    { name: 'VidSrcDev', adFree: true, url: isTV ? `https://vidsrc.dev/embed/tv/${id}${se}` : `https://vidsrc.dev/embed/movie/${id}` },
    { name: 'VidSrcNL', adFree: true, url: isTV ? `https://player.vidsrc.nl/embed/tv/${id}${se}` : `https://player.vidsrc.nl/embed/movie/${id}` },
    { name: 'Frembed', adFree: true, url: isTV ? `https://frembed.xyz/api/film.php?id=${id}${seQuery}` : `https://frembed.xyz/api/film.php?id=${id}` },
    { name: 'VidSrcTo', adFree: true, url: isTV ? `https://vidsrc.to/embed/tv/${id}${se}` : `https://vidsrc.to/embed/movie/${id}` },
    { name: 'VidSrcRip', adFree: true, url: isTV ? `https://vidsrc.rip/embed/tv/${id}${se}` : `https://vidsrc.rip/embed/movie/${id}` },
    { name: 'VidSrcSu', adFree: true, url: isTV ? `https://vidsrc.su/embed/tv/${id}${se}` : `https://vidsrc.su/embed/movie/${id}` },
    { name: 'VidSrcCo', adFree: true, url: isTV ? `https://player.vidsrc.co/embed/tv/${id}${se}` : `https://player.vidsrc.co/embed/movie/${id}` },
    { name: 'VidSrcXyz', adFree: true, url: isTV ? `https://vidsrc.xyz/embed/tv/${id}${se}` : `https://vidsrc.xyz/embed/movie/${id}` },
    { name: '123Embed', adFree: true, url: isTV ? `https://play2.123embed.net/tv/${id}${se}` : `https://play2.123embed.net/movie/${id}` },
    { name: '111Movies', adFree: true, url: isTV ? `https://111movies.com/tv/${id}${se}` : `https://111movies.com/movie/${id}` },
    { name: 'Flicky', adFree: true, url: isTV ? `https://flicky.host/embed/tv/?id=${id}${seQuery}` : `https://flicky.host/embed/movie/?id=${id}` },
    { name: 'Smashy', adFree: true, url: isTV ? `https://player.smashy.stream/tv/${id}${se}` : `https://player.smashy.stream/movie/${id}` },
    { name: 'Hexa', adFree: true, url: isTV ? `https://hexa.watch/watch/tv/${id}?s=${season}&e=${episode}` : `https://hexa.watch/watch/movie/${id}` },
    { name: 'CinePulse', adFree: true, url: isTV ? `https://api.cinepulse.fr/watch/sources?tmdbId=${id}&type=tv&season=${season}&episode=${episode}` : `https://api.cinepulse.fr/watch/sources?tmdbId=${id}&type=movie` },
    // ============================================================
    // NGUỒN DỰ PHÒNG — có quảng cáo hơn, chỉ dùng khi nguồn trên lỗi
    // ============================================================
    { name: 'VidSrcPro', url: isTV ? `https://vidsrc.pro/embed/tv/${id}${se}` : `https://vidsrc.pro/embed/movie/${id}` },
    { name: 'Embed.su', url: isTV ? `https://embed.su/embed/tv/${id}${se}` : `https://embed.su/embed/movie/${id}` },
    { name: 'SuperEmbed', url: `https://multiembed.mov/?video_id=${id}&tmdb=1${seQuery}` },
    { name: '2Embed', url: isTV ? `https://www.2embed.cc/embed/${id}${se}` : `https://www.2embed.cc/embed/${id}` },
    { name: 'VidLink', url: isTV ? `https://vidlink.pro/tv/${id}${se}` : `https://vidlink.pro/movie/${id}` },
    { name: 'VidSrcVip', url: isTV ? `https://vidsrc.vip/embed/tv/${id}${se}` : `https://vidsrc.vip/embed/movie/${id}` },
    { name: 'PrimeWire', url: isTV ? `https://www.primewire.tf/embed/tv?tmdb=${id}${seQuery}` : `https://www.primewire.tf/embed/movie?tmdb=${id}` },
    // Nguồn cũ còn để dự phòng cuối
    { name: 'Vidsrc.fyi', url: isTV ? `https://vidsrc.fyi/embed/tv/${id}${se}` : `https://vidsrc.fyi/embed/movie/${id}` },
    { name: 'Vid-src.top', url: isTV ? `https://vid-src.top/embed/tv/${id}${se}` : `https://vid-src.top/embed/movie/${id}` },
    { name: 'Vidsrc.me', url: isTV ? `https://vidsrcme.ru/embed/tv/${id}${se}` : `https://vidsrcme.ru/embed/movie/${id}` },
    { name: 'Vidsrc.hair', url: isTV ? `https://vidsrc.hair/embed/tv/${id}${se}` : `https://vidsrc.hair/embed/movie/${id}` },
    { name: 'MoviesAPI', url: `https://moviesapi.club/${isTV ? 'tv' : 'movie'}/${id}` },
    // CinemaOS — trang xem phim gọn (route /watch) của chính cinemaos.live
    { name: 'CinemaOS', url: isTV ? `https://cinemaos.live/tv/watch/${id}?season=${season}&episode=${episode}` : `https://cinemaos.live/watch/movie/${id}` },
  ];
  return sources;
}

/** Link tìm phim đó trên các nguồn mở (dự phòng cuối cùng) */
export function openExternalSearch(movie) {
  const q = encodeURIComponent((movie.title || movie.name || '') + ' full movie');
  window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener');
}
