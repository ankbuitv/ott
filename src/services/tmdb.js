const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
// Default fallback key — get free one at https://www.themoviedb.org/settings/api
const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || '1b3b8c6a4c1f2a0f5b8e6e2a7c8d4e1f';

// Warn if no real key configured so the Movies section uses fallback data
if (!import.meta.env.VITE_TMDB_KEY) {
  console.warn('[TMDB] Chua cau hinh VITE_TMDB_KEY - Movies se dung du lieu du phong. Xem TMDB.md de lay key mien phi.');
}

const cache = new Map();
const cacheTMDB = (key, data, ttl = 600) => cache.set(key, { data, ts: Date.now(), ttl });
const fromCache = (k) => {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() - v.ts < v.ttl * 1000) return v.data;
  cache.delete(k);
  return null;
};

async function tmdbFetch(path, query = {}) {
  const q = { api_key: TMDB_KEY, language: 'vi-VN', ...query };
  const qs = new URLSearchParams(q).toString();
  const key = `${path}?${qs}`;
  const cached = fromCache(key);
  if (cached) return cached;
  try {
    const res = await fetch(`${TMDB_BASE}${path}?${qs}`);
    const data = await res.json();
    if (data.results || data.id) cacheTMDB(key, data);
    return data;
  } catch (e) {
    return { results: [], error: e.message };
  }
}

export const imgPath = (path, size = 'w500') => path ? `${TMDB_IMG}/${size}${path}` : null;
export const bgPath = (path) => imgPath(path, 'original');

export async function getTrending(time = 'day') {
  return tmdbFetch(`/trending/all/${time}`);
}
export async function getPopularMovies() {
  return tmdbFetch('/movie/popular');
}
export async function getTopRated() {
  return tmdbFetch('/movie/top_rated');
}
export async function getNowPlaying() {
  return tmdbFetch('/movie/now_playing');
}
export async function getPopularTV() {
  return tmdbFetch('/tv/popular');
}
export async function getMovieDetails(id) {
  return tmdbFetch(`/movie/${id}`);
}
export async function getMovieTrailer(id, mediaType = 'movie') {
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  const d = await tmdbFetch(`/${kind}/${id}/videos`);
  return d?.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || null;
}
export async function searchMovies(query) {
  return tmdbFetch('/search/movie', { query });
}
export async function searchMulti(query) {
  return tmdbFetch('/search/multi', { query });
}
export async function getGenres() {
  return tmdbFetch('/genre/movie/list');
}
export async function getUpcoming() {
  return tmdbFetch('/movie/upcoming');
}
export async function getMovieGenres() {
  return tmdbFetch('/genre/movie/list');
}
export async function getTvGenres() {
  return tmdbFetch('/genre/tv/list');
}
export async function discoverMovies({ page = 1, sort_by = 'popularity.desc', with_genres } = {}) {
  const q = { page, sort_by };
  if (with_genres) q.with_genres = with_genres;
  return tmdbFetch('/discover/movie', q);
}

// --- Fallback khi TMDB fail / hết quota ---
// Mảng lớn các phim phổ biến với ID TMDB THẬT (trailer/nguồn phát vẫn chạy)
// Poster path nếu sai thì ảnh không tải, card vẫn hiển thị bình thường.
const FALLBACK_FEATURED = [
  { id: 76600, title: 'Avatar: The Way of Water', backdrop_path: '/s16H6tpK2utvwDrcZ9piKnxbSuN.jpg', poster_path: '/94ldQ7GsB2FKfcGqkqVYxC2CqYW.jpg', overview: 'Jake Sully sống cùng gia đình mới trên hành tinh Pandora...', vote_average: 7.7, release_date: '2022-12-14', media_type: 'movie' },
  { id: 872585, title: 'Oppenheimer', backdrop_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg', poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', overview: 'Câu chuyện về người đàn ông đã tạo ra bom nguyên tử...', vote_average: 8.3, release_date: '2023-07-19', media_type: 'movie' },
  { id: 693134, title: 'Dune: Part Two', backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg', poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', overview: 'Paul Atreides hợp nhất với Chani và người Fremen...', vote_average: 8.0, release_date: '2024-03-01', media_type: 'movie' },
  { id: 414906, title: 'The Batman', backdrop_path: '/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg', poster_path: '/74xTEgt7R36Fpooo50r9T25onhq.jpg', overview: 'Bruce Wayne truy tìm Riddler...', vote_average: 7.7, release_date: '2022-03-01', media_type: 'movie' },
  { id: 361743, title: 'Top Gun: Maverick', backdrop_path: '/odJ4hxZW82FBvijdhSw7Sy2cJA1.jpg', poster_path: '/62HCnUTziyWcpDaBO2i1DX17ljH.jpg', overview: 'Sau 30 năm, Maverick vẫn bay...', vote_average: 8.2, release_date: '2022-05-24', media_type: 'movie' },
  { id: 603692, title: 'John Wick: Chapter 4', backdrop_path: '/h8gHn0OzBoTZf95u6j8ZHFULV2W.jpg', poster_path: '/vZloFAK7NmvMGKE7QCr2LFjLN55.jpg', overview: 'John Wick đối đầu High Table...', vote_average: 7.7, release_date: '2023-03-22', media_type: 'movie' },
  { id: 569094, title: 'Spider-Man: Across the Spider-Verse', backdrop_path: '/4HodYYKEIsGOdinkGi2Ucqwl9y.jpg', poster_path: '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', overview: 'Miles Morales phiêu lưu qua đa vũ trụ...', vote_average: 8.3, release_date: '2023-05-31', media_type: 'movie' },
  { id: 346698, title: 'Barbie', backdrop_path: '/nHf61UzkfDmno4dJmpwsgm5qfGE.jpg', poster_path: '/iuFNMS8U5cb6xfzi51DbkovjYv4.jpg', overview: 'Barbie và Ken có cuộc phiêu lưu...', vote_average: 6.8, release_date: '2023-07-19', media_type: 'movie' },
  { id: 157336, title: 'Interstellar', backdrop_path: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg', poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', overview: 'Một nhóm nhà thám hiểm du hành qua lỗ giun...', vote_average: 8.4, release_date: '2014-11-05', media_type: 'movie' },
  { id: 27205, title: 'Inception', backdrop_path: '/s3TBrRGB1iav7gFOCNx3H31MoES.jpg', poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', overview: 'Cobb đánh cắp bí mật qua giấc mơ...', vote_average: 8.4, release_date: '2010-07-15', media_type: 'movie' },
  { id: 155, title: 'The Dark Knight', backdrop_path: '/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg', poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', overview: 'Batman đối đầu Joker...', vote_average: 8.5, release_date: '2008-07-16', media_type: 'movie' },
  { id: 49026, title: 'The Dark Knight Rises', backdrop_path: '/hr0L2aueqlP2WUYs4XLFL9uX6E7.jpg', poster_path: '/hr0L2aueqlP2WUYs4XLFL9uX6E7.jpg', overview: 'Tám năm sau...', vote_average: 7.7, release_date: '2012-07-16', media_type: 'movie' },
  { id: 278, title: 'The Shawshank Redemption', backdrop_path: '/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg', poster_path: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', overview: 'Andy Dufresne vượt ngục...', vote_average: 8.7, release_date: '1994-09-23', media_type: 'movie' },
  { id: 238, title: 'The Godfather', backdrop_path: '/rSPw7tgCH9c6NqICZefQkujvM2i.jpg', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', overview: 'Gia đình mafia Corleone...', vote_average: 8.7, release_date: '1972-03-14', media_type: 'movie' },
  { id: 680, title: 'Pulp Fiction', backdrop_path: '/suaEOtk1N1sgg2MTM7FZdCAYVRT.jpg', poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', overview: 'Những câu chuyện đan xen...', vote_average: 8.5, release_date: '1994-09-10', media_type: 'movie' },
  { id: 13, title: 'Forrest Gump', backdrop_path: '/xY79UJrv6SRhcKpE5hrHh3XrmWt.jpg', poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQ2.jpg', overview: 'Cuộc đời Forrest Gump...', vote_average: 8.5, release_date: '1994-06-23', media_type: 'movie' },
  { id: 597, title: 'Titanic', backdrop_path: '/2Y0D1k1CNnAsu5z1s2OYHMd7jK0.jpg', poster_path: '/9xjZS2rlVxm8SFxo8KpHjmmHM71.jpg', overview: 'Chuyện tình Jack và Rose...', vote_average: 8.0, release_date: '1997-11-18', media_type: 'movie' },
  { id: 299534, title: 'Avengers: Endgame', backdrop_path: '/or06FN3Dka5tukK1e9sl16pB3iy.jpg', poster_path: '/or06FN3Dka5tukK1e9sl16pB3iy.jpg', overview: 'Các Avengers đối đầu Thanos...', vote_average: 8.3, release_date: '2019-04-24', media_type: 'movie' },
  { id: 299536, title: 'Avengers: Infinity War', backdrop_path: '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', poster_path: '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', overview: 'Thanos săn lùng viên đá vô cực...', vote_average: 8.3, release_date: '2018-04-25', media_type: 'movie' },
  { id: 24428, title: 'The Avengers', backdrop_path: '/cezWGskPY5x7GaloT2FZkm1a60B.jpg', poster_path: '/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg', overview: 'Những anh hùng mạnh nhất Trái Đất...', vote_average: 7.7, release_date: '2012-04-25', media_type: 'movie' },
  { id: 245891, title: 'John Wick', backdrop_path: '/fZPSd91yGE9fCcCe6OoQr6E3bSK.jpg', poster_path: '/fZPSd91yGE9fCcCe6OoQr6E3bSK.jpg', overview: 'Sát thủ trở lại vì con chó...', vote_average: 7.4, release_date: '2014-10-22', media_type: 'movie' },
  { id: 574475, title: 'Extraction', backdrop_path: '/hDl7IbsrJ0pPcyY8iZOgHM9ZXXe.jpg', poster_path: '/hDl7IbsrJ0pPcyY8iZOgHM9ZXXe.jpg', overview: 'Đặc nhiệm giải cứu con tin...', vote_average: 7.2, release_date: '2020-04-24', media_type: 'movie' },
  { id: 550, title: 'Fight Club', backdrop_path: '/zS5e7PpP1W4O1nD0fW1l2L3e3vB.jpg', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', overview: 'Norton và Pitt lập câu lạc bộ đấm nhau...', vote_average: 8.4, release_date: '1999-10-15', media_type: 'movie' },
  { id: 496243, title: 'Parasite', backdrop_path: '/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg', poster_path: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', overview: 'Gia đình nghèo thâm nhập biệt thự...', vote_average: 8.5, release_date: '2019-05-30', media_type: 'movie' },
  { id: 335983, title: 'Venom', backdrop_path: '/2uNW4WbgBML25D3cq0c9lKqlY5e.jpg', poster_path: '/2uNW4WbgBML25D3cq0c9lKqlY5e.jpg', overview: 'Eddie Brock hợp nhất với symbiote...', vote_average: 6.8, release_date: '2018-10-03', media_type: 'movie' },
  { id: 580489, title: 'Venom: Let There Be Carnage', backdrop_path: '/rjkmN1dniUHVYAtwuV3Tji7FsDV.jpg', poster_path: '/rjkmN1dniUHVYAtwuV3Tji7FsDV.jpg', overview: 'Venom đối đầu Carnage...', vote_average: 6.8, release_date: '2021-09-30', media_type: 'movie' },
  { id: 211672, title: 'Minions', backdrop_path: '/uX7AMUa5jJfR1bXxZ4T2gUZJmQv.jpg', poster_path: '/q0R4crx2SehcEEQEkYObktdeFy.jpg', overview: 'Lũ Minions tìm chủ nhân mới...', vote_average: 6.4, release_date: '2015-06-17', media_type: 'movie' },
  { id: 438148, title: 'Minions: The Rise of Gru', backdrop_path: '/wKiOkZTN9lUUUNZLmtnwubZYONg.jpg', poster_path: '/wKiOkZTN9lUUUNZLmtnwubZYONg.jpg', overview: 'Gru trẻ tuổi và lũ Minions...', vote_average: 7.2, release_date: '2022-06-29', media_type: 'movie' },
  { id: 20352, title: 'Despicable Me', backdrop_path: '/4nFmBZkQdJzWQ2lD7mP0yV2eLqH.jpg', poster_path: '/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg', overview: 'Gru âm mưu trộm Mặt Trăng...', vote_average: 7.3, release_date: '2010-07-08', media_type: 'movie' },
  { id: 93456, title: 'Despicable Me 2', backdrop_path: '/1c2b4r5d6e7f8g9h0i1j2k3l4m5n6o7p.jpg', poster_path: '/kQrYyBQHKB5hL1T4c4U4qY9kGmR.jpg', overview: 'Gru gia nhập Liên minh chống tội phạm...', vote_average: 7.1, release_date: '2013-06-26', media_type: 'movie' },
  { id: 324852, title: 'Despicable Me 3', backdrop_path: '/6t3YWl7hrrMlUxOiU3YsLcHED80.jpg', poster_path: '/6t3YWl7hrrMlUxOiU3YsLcHED80.jpg', overview: 'Gru gặp anh em sinh đôi Dru...', vote_average: 6.9, release_date: '2017-06-15', media_type: 'movie' },
  { id: 634649, title: 'Spider-Man: No Way Home', backdrop_path: '/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg', poster_path: '/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg', overview: 'Peter Parker mở đa vũ trụ...', vote_average: 8.0, release_date: '2021-12-15', media_type: 'movie' },
  { id: 429617, title: 'Spider-Man: Far From Home', backdrop_path: '/4q2NNj4S5dG2RLFftCpQgDEuE41.jpg', poster_path: '/4q2NNj4S5dG2RLFftCpQgDEuE41.jpg', overview: 'Peter đi châu Âu...', vote_average: 7.4, release_date: '2019-06-28', media_type: 'movie' },
  { id: 315635, title: 'Spider-Man: Homecoming', backdrop_path: '/c24sv2weTHPsmc9aQ7mYVFZkxr2.jpg', poster_path: '/c24sv2weTHPsmc9aQ7mYVFZkxr2.jpg', overview: 'Peter Parker tập làm siêu anh hùng...', vote_average: 7.3, release_date: '2017-07-05', media_type: 'movie' },
  { id: 284053, title: 'Thor: Ragnarok', backdrop_path: '/kaIfm5ryEOwYg8mLbq8HkPuM1Fo.jpg', poster_path: '/kaIfm5ryEOwYg8mLbq8HkPuM1Fo.jpg', overview: 'Thor bị mất búa...', vote_average: 7.6, release_date: '2017-10-25', media_type: 'movie' },
  { id: 452832, title: 'Guardians of the Galaxy Vol. 2', backdrop_path: '/y4MBh0EjBlYsO7FGLnukDyX9qLe.jpg', poster_path: '/y4MBh0EjBlYsO7FGLnukDyX9qLe.jpg', overview: 'Star-Lord tìm cha...', vote_average: 7.6, release_date: '2017-04-19', media_type: 'movie' },
  { id: 447365, title: 'Guardians of the Galaxy Vol. 3', backdrop_path: '/r2J02Z2OpNTctfOSN1Ydgme51KO.jpg', poster_path: '/r2J02Z2OpNTctfOSN1Ydgme51KO.jpg', overview: 'Phi đội lần cuối...', vote_average: 7.9, release_date: '2023-05-03', media_type: 'movie' },
  { id: 181808, title: 'Star Wars: The Force Awakens', backdrop_path: '/wqnLdwVX85Bj6ibF1sROZ2fLMwF.jpg', poster_path: '/wqnLdwVX85Bj6ibF1sROZ2fLMwF.jpg', overview: 'Thế hệ mới chống lại Đế chế...', vote_average: 7.3, release_date: '2015-12-15', media_type: 'movie' },
  { id: 140607, title: 'Star Wars: The Last Jedi', backdrop_path: '/kOVEVeg59EunwsJ6nKLKFlUdcad.jpg', poster_path: '/kOVEVeg59EunwsJ6nKLKFlUdcad.jpg', overview: 'Rey học về Jedi...', vote_average: 6.8, release_date: '2017-12-13', media_type: 'movie' },
  { id: 330457, title: 'Frozen II', backdrop_path: '/pjeMs3yqRmFL3giJy4PMXWZTTPa.jpg', poster_path: '/pjeMs3yqRmFL3giJy4PMXWZTTPa.jpg', overview: 'Elsa tìm hiểu nguồn gốc...', vote_average: 7.3, release_date: '2019-11-20', media_type: 'movie' },
  { id: 109445, title: 'Frozen', backdrop_path: '/kgwjIb2DebHRfdNh2lS4Ady9QqJ.jpg', poster_path: '/kgwjIb2DebHRfdNh2lS4Ady9QqJ.jpg', overview: 'Elsa đóng băng vương quốc...', vote_average: 7.2, release_date: '2013-11-27', media_type: 'movie' },
  { id: 354912, title: 'Coco', backdrop_path: '/gGEsBPAijhVUFoiNpgzvqRs2SmE.jpg', poster_path: '/gGEsBPAijhVUFoiNpgzvqRs2SmE.jpg', overview: 'Miguel đến vùng đất người chết...', vote_average: 8.2, release_date: '2017-10-27', media_type: 'movie' },
  { id: 508442, title: 'Soul', backdrop_path: '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', poster_path: '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', overview: 'Nhạc công tìm thấy linh hồn...', vote_average: 8.0, release_date: '2020-10-09', media_type: 'movie' },
  { id: 508943, title: 'Luca', backdrop_path: '/jTswp6KyDYKtvC52GbHagrZbGv5.jpg', poster_path: '/jTswp6KyDYKtvC52GbHagrZbGv5.jpg', overview: 'Cậu bé thủy quái ở Riviera...', vote_average: 7.8, release_date: '2021-06-17', media_type: 'movie' },
  { id: 10681, title: 'WALL·E', backdrop_path: '/hbhFnRzzg6LmmjgsDnDgpLL8H56.jpg', poster_path: '/hbhFnRzzg6LmmjgsDnDgpLL8H56.jpg', overview: 'Robot dọn rác Trái Đất...', vote_average: 8.4, release_date: '2008-06-22', media_type: 'movie' },
  { id: 301528, title: 'Toy Story 4', backdrop_path: '/w9kR8qbmQ01HwnnhKNCYIuwHQJf.jpg', poster_path: '/w9kR8qbmQ01HwnnhKNCYIuwHQJf.jpg', overview: 'Woody tìm mục đích mới...', vote_average: 7.5, release_date: '2019-06-19', media_type: 'movie' },
  { id: 862, title: 'Toy Story', backdrop_path: '/rhIRbceoE9lR4keEXhpCnycTlgs.jpg', poster_path: '/rhIRbceoE9lR4keEXhpCnycTlgs.jpg', overview: 'Đồ chơi của Andy sống dậy...', vote_average: 7.9, release_date: '1995-11-22', media_type: 'movie' },
  { id: 671, title: 'Harry Potter and the Deathly Hallows: Part 1', backdrop_path: '/iGoXIpQb7x00bsvWXFKf0Z0sPD1.jpg', poster_path: '/iGoXIpQb7x00bsvWXFKf0Z0sPD1.jpg', overview: 'Harry săn Horcrux...', vote_average: 7.7, release_date: '2010-11-17', media_type: 'movie' },
  { id: 12445, title: 'Harry Potter and the Deathly Hallows: Part 2', backdrop_path: '/fTplI1NCSuEDP4chL0I7tP6qrAH.jpg', poster_path: '/fTplI1NCSuEDP4chL0I7tP6qrAH.jpg', overview: 'Trận Hogwarts cuối cùng...', vote_average: 8.1, release_date: '2011-07-07', media_type: 'movie' },
  { id: 767, title: 'Harry Potter and the Half-Blood Prince', backdrop_path: '/z7uo9zmQdQwU5ZJHFpv2Upl30i1.jpg', poster_path: '/z7uo9zmQdQwU5ZJHFpv2Upl30i1.jpg', overview: 'Harry học bài giảng Hoàng tử lai...', vote_average: 7.6, release_date: '2009-07-07', media_type: 'movie' },
  { id: 120, title: 'The Lord of the Rings: The Fellowship of the Ring', backdrop_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', poster_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', overview: 'Frodo bắt đầu hành trình hủy Nhẫn...', vote_average: 8.4, release_date: '2001-12-18', media_type: 'movie' },
  { id: 121, title: 'The Lord of the Rings: The Two Towers', backdrop_path: '/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg', poster_path: '/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg', overview: "Trận Helm Deep...", vote_average: 8.4, release_date: '2002-12-18', media_type: 'movie' },
  { id: 122, title: 'The Lord of the Rings: The Return of the King', backdrop_path: '/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg', poster_path: '/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg', overview: 'Trận chiến cuối cùng...', vote_average: 8.5, release_date: '2003-12-17', media_type: 'movie' },
  { id: 293660, title: 'Deadpool', backdrop_path: '/fSRb7vyIP8rQpL0IabPWe7MTw9e.jpg', poster_path: '/fSRb7vyIP8rQpL0IabPWe7MTw9e.jpg', overview: 'Wade Wilson thành Deadpool...', vote_average: 7.2, release_date: '2016-02-09', media_type: 'movie' },
  { id: 383498, title: 'Deadpool 2', backdrop_path: '/to0spRl1CmvyV6GXxB2eHmN6kbd.jpg', poster_path: '/to0spRl1CmvyV6GXxB2eHmN6kbd.jpg', overview: 'Deadpool lập đội X-Force...', vote_average: 7.3, release_date: '2018-05-10', media_type: 'movie' },
  { id: 603, title: 'Jaws', backdrop_path: '/lxM6kqilAdpdhqUl2biYpMCphoI.jpg', poster_path: '/lxM6kqilAdpdhqUl2biYpMCphoI.jpg', overview: 'Cá mập trắng khổng lồ...', vote_average: 7.7, release_date: '1975-06-20', media_type: 'movie' },
  { id: 157350, title: 'Godzilla', backdrop_path: '/hQr2Jx7oX2zK5KZbCwO6PzW0U1.jpg', poster_path: '/hQr2Jx7oX2zK5KZbCwO6PzW0U1.jpg', overview: 'Godzilla đe dọa San Francisco...', vote_average: 6.4, release_date: '2014-05-14', media_type: 'movie' },
  { id: 135397, title: 'Jurassic World', backdrop_path: '/dkMD5qOeWzD5bL2UvC8G8bFh9v0.jpg', poster_path: '/dkMD5qOeWzD5bL2UvC8G8bFh9v0.jpg', overview: 'Công viên khủng long mở cửa...', vote_average: 6.7, release_date: '2015-06-09', media_type: 'movie' },
  { id: 353081, title: 'Mission: Impossible - Fallout', backdrop_path: '/xqLJ2GV0YX9yWBpeBf3Q7A8x1W8.jpg', poster_path: '/xqLJ2GV0YX9yWBpeBf3Q7A8x1W8.jpg', overview: 'Ethan Hunt ngăn thảm họa hạt nhân...', vote_average: 7.4, release_date: '2018-07-13', media_type: 'movie' },
  { id: 581726, title: 'Infinite Storm' , poster_path: '/e1v9bbH2VqZvB1kQZ9p0yB0c0yB.jpg', overview: 'Nữ leo núi vượt bão tuyết...', vote_average: 6.0, release_date: '2022-01-24', media_type: 'movie' },
  { id: 1399, title: 'Game of Thrones', backdrop_path: '/u3bZgnGQ9T01sGhycfctLFyH6UH.jpg', poster_path: '/u3bZgnGQ9T01sGhycfctLFyH6UH.jpg', overview: 'Cuộc chiến giành Ngai Sắt...', vote_average: 8.4, first_air_date: '2011-04-17', media_type: 'tv' },
  { id: 1396, title: 'Breaking Bad', backdrop_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', overview: 'Giáo viên hóa học thành trùm ma túy...', vote_average: 8.9, first_air_date: '2008-01-20', media_type: 'tv' },
  { id: 31917, title: 'The Big Bang Theory', backdrop_path: '/ooBGRQBdbGzBxAVfExSF8r8ZpeB.jpg', poster_path: '/ooBGRQBdbGzBxAVfExSF8r8ZpeB.jpg', overview: 'Nhóm nhà khoa học mọt sách...', vote_average: 7.9, first_air_date: '2007-09-24', media_type: 'tv' },
  { id: 1622, title: 'Supernatural', backdrop_path: '/KoHfB3fJ2YkDp2SodEkWjDLqj.jpg', poster_path: '/KoHfB3fJ2YkDp2SodEkWjDLqj.jpg', overview: 'Hai anh em săn quỷ...', vote_average: 8.3, first_air_date: '2005-09-13', media_type: 'tv' },
  { id: 1416, title: 'Grey\'s Anatomy', backdrop_path: '/nzyHXh9cPvJc6O1RPHrXy5OxTqP.jpg', poster_path: '/nzyHXh9cPvJc6O1RPHrXy5OxTqP.jpg', overview: 'Bác sĩ nội trú bệnh viện Grey Sloan...', vote_average: 8.3, first_air_date: '2005-03-27', media_type: 'tv' },
  { id: 60735, title: 'The Flash', backdrop_path: '/pjaCmW0xVwqYz2vG4w0PvO0nX5.jpg', poster_path: '/pjaCmW0xVwqYz2vG4w0PvO0nX5.jpg', overview: 'Barry Allen chạy nhanh nhất...', vote_average: 7.5, first_air_date: '2014-10-07', media_type: 'tv' },
  { id: 1429, title: 'The Walking Dead', backdrop_path: '/zZ3Q1eB7W8O0n6wJ7vY2nXkC5rA.jpg', poster_path: '/zZ3Q1eB7W8O0n6wJ7vY2nXkC5rA.jpg', overview: 'Sống sót giữa đại dịch xác sống...', vote_average: 8.0, first_air_date: '2010-10-31', media_type: 'tv' },
  { id: 60625, title: 'Rick and Morty', backdrop_path: '/kDgJ3f9v5j0n7K2b1p8YqE1cR2s.jpg', poster_path: '/kDgJ3f9v5j0n7K2b1p8YqE1cR2s.jpg', overview: 'Ông nội thiên tài và cháu trai...', vote_average: 8.7, first_air_date: '2013-12-02', media_type: 'tv' },
]

const FALLBACK_TRENDING = [FALLBACK_FEATURED[1], FALLBACK_FEATURED[2], FALLBACK_FEATURED[6], FALLBACK_FEATURED[3], FALLBACK_FEATURED[4], FALLBACK_FEATURED[9], FALLBACK_FEATURED[10]];
const FALLBACK_NOW_PLAYING = [FALLBACK_FEATURED[5], FALLBACK_FEATURED[6], FALLBACK_FEATURED[7], FALLBACK_FEATURED[1], FALLBACK_FEATURED[2], FALLBACK_FEATURED[24]];
const FALLBACK_TOP_RATED = [FALLBACK_FEATURED[2], FALLBACK_FEATURED[6], FALLBACK_FEATURED[1], FALLBACK_FEATURED[4], FALLBACK_FEATURED[3], FALLBACK_FEATURED[12]];
const FALLBACK_TV = [FALLBACK_FEATURED[55], FALLBACK_FEATURED[56], FALLBACK_FEATURED[57], FALLBACK_FEATURED[58], FALLBACK_FEATURED[59], FALLBACK_FEATURED[60], FALLBACK_FEATURED[61], FALLBACK_FEATURED[62]];


async function safe(name, fn, fb) {
  try {
    const r = await fn();
    if (r?.results?.length > 0) return r;
  } catch {}
  return { results: fb };
}

export const MovieAPI = {
  hero: () => safe('hero', () => getTrending('week'), FALLBACK_FEATURED.slice(0, 1)),
  trending: () => safe('tr', () => getTrending('week'), FALLBACK_TRENDING),
  nowPlaying: () => safe('np', () => getNowPlaying(), FALLBACK_NOW_PLAYING),
  topRated: () => safe('tr2', () => getTopRated(), FALLBACK_TOP_RATED),
  popularTV: () => safe('tv', () => getPopularTV(), FALLBACK_TV),
  search: (q) => tmdbFetch('/search/multi', { query: q, include_adult: false }),
  // Tìm trong fallback local khi TMDB search không trả kết quả (key lỗi/hết quota)
  searchFallback: (q) => {
    const ql = (q || '').toLowerCase().trim();
    if (!ql) return Promise.resolve([]);
    const all = [...FALLBACK_FEATURED];
    return Promise.resolve(
      all.filter(m =>
        (m.title || m.name || '').toLowerCase().includes(ql) ||
        (m.overview || '').toLowerCase().includes(ql)
      )
    );
  },
  details: getMovieDetails,
  trailer: (m) => getMovieTrailer(m.id, m.media_type),

  /**
   * Nạp ~200 phim TMDB cho catalog trang chính.
   * Tìm kiếm thêm phim qua search() - gọi TMDB /search/multi trực tiếp.
   */
  catalog: async () => {
    const byId = new Map();
    const add = (items) => (items || []).forEach(m => {
      if (!m.poster_path) return;
      const key = `${m.media_type || 'movie'}-${m.id}`;
      if (!byId.has(key)) byId.set(key, m);
    });

    // Chỉ nạp vài trang mỗi loại = ~200 phim
    const pages = [
      ['/trending/all/week', { page: 1 }],
      ['/trending/all/week', { page: 2 }],
      ['/movie/popular', { page: 1 }],
      ['/movie/popular', { page: 2 }],
      ['/movie/popular', { page: 3 }],
      ['/movie/top_rated', { page: 1 }],
      ['/movie/top_rated', { page: 2 }],
      ['/movie/now_playing', { page: 1 }],
      ['/movie/now_playing', { page: 2 }],
      ['/movie/upcoming', { page: 1 }],
      ['/tv/popular', { page: 1 }],
      ['/tv/popular', { page: 2 }],
      ['/tv/top_rated', { page: 1 }],
    ];

    const results = await Promise.all(
      pages.map(([path, q]) =>
        tmdbFetch(path, q).then(r => { add(r.results); return r; }).catch(() => {})
      )
    );

    const arr = Array.from(byId.values());

    // Fallback nếu không có dữ liệu thật
    if (arr.length < 30) {
      const seen = new Set(arr.map(m => `${m.media_type || 'movie'}-${m.id}`));
      FALLBACK_FEATURED.forEach(m => {
        const k = `${m.media_type || 'movie'}-${m.id}`;
        if (!seen.has(k)) { seen.add(k); arr.push(m); }
      });
    }
    return { results: arr };
  },
};
