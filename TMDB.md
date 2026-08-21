# CHRTV - Hướng dẫn dùng TMDB (The Movie Database) API

## 1. Lấy API Key miễn phí

1. Truy cập **https://www.themoviedb.org/signup** → đăng ký tài khoản (miễn phí).
2. Đăng nhập xong, vào **https://www.themoviedb.org/settings/api** (trong mục *Settings → API*).
3. Bấm **"Create"** hoặc **"Request an API Key"**.
4. Chọn loại **"Developer"**, điền tên ứng dụng (ví dụ: `CHRTV`), mô tả ngắn, website có thể để trống.
5. Đồng ý điều khoản → nhận **API Key (v3 auth)** — một chuỗi 32 ký tự hex, ví dụ:
   ```
   a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
   ```
6. Chờ email xác nhận từ TMDB (thường vài phút, có khi vài giờ). Key chỉ có hiệu lực sau khi xác nhận.

> ⚠️ Lưu ý: Mỗi key có giới hạn ~50 request/giây (rất rộng rãi). Nếu thấy lỗi `401` hoặc `Invalid API key`, nghĩa là key chưa được TMDB kích hoạt hoặc gõ sai.

## 2. Cấu hình vào dự án

### Cách A — Dùng khi build bằng `wrangler deploy` (Cloudflare Workers + Pages)

File `wrangler.toml` đã có build step `npm run build`. Thêm biến môi trường trên Cloudflare:

1. Vào Cloudflare Dashboard → **Workers & Pages → chrtv-backend → Settings → Variables and Secrets**.
2. Thêm biến:
   - **Type**: Plain text
   - **Name**: `VITE_TMDB_KEY`
   - **Value**: key 32 ký tự của bạn
3. **Save** rồi redeploy (`npx wrangler deploy` hoặc push lên GitHub nếu có CI/CD).

Build lúc deploy sẽ đọc `VITE_TMDB_KEY` và nhúng vào bundle frontend.

### Cách B — Chạy local

Tạo file `.env.local` trong thư mục gốc dự án:

```bash
VITE_TMDB_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Sau đó `npm run dev` hoặc `npm run build`.

> 📌 Vite chỉ đọc biến có tiền tố `VITE_`. Code đọc key tại `src/services/tmdb.js`:
> ```js
> const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || '<fallback key mặc định>';
> ```
> Nếu không set biến, app tự dùng key fallback — nếu key đó hết quota thì **Movies vẫn hoạt động** nhờ dữ liệu dự phòng (fallback) đã nhúng sẵn.

## 3. Các API đang dùng trong app

| Chức năng | Endpoint TMDB | Hàm trong `src/services/tmdb.js` |
|---|---|---|
| Phim xu hướng | `GET /trending/all/{day\|week}` | `getTrending()` |
| Phim phổ biến | `GET /movie/popular` | `getPopularMovies()` |
| Đang chiếu rạp | `GET /movie/now_playing` | `getNowPlaying()` |
| Đánh giá cao | `GET /movie/top_rated` | `getTopRated()` |
| TV show phổ biến | `GET /tv/popular` | `getPopularTV()` |
| Chi tiết phim | `GET /movie/{id}` | `getMovieDetails()` |
| Trailer | `GET /movie/{id}/videos` | `getMovieTrailer()` |
| Tìm kiếm | `GET /search/multi?query=...` | `searchMulti()` / `MovieAPI.search()` |
| Ảnh | `https://image.tmdb.org/t/p/{size}{path}` | `imgPath()` / `bgPath()` |

Nguồn chính thức: **https://developer.themoviedb.org/docs/getting-started**

## 4. Kiểm tra key hoạt động

Chạy thử bằng `curl` (thay `YOUR_KEY` bằng key của bạn):

```bash
curl "https://api.themoviedb.org/3/trending/all/week?api_key=YOUR_KEY&language=vi-VN" | head -c 400
```

- Trả về JSON có `"results": [...]` → key OK ✅
- Trả về `{"status_code":7,"status_message":"Invalid API key"}` → key chưa kích hoạt ❌ (chờ email xác nhận TMDB)

## 5. Gỡ rối nhanh

- **Movies không hiện phim mới, chỉ hiện phim cũ quen thuộc** → key bị lỗi/thiếu, app đang dùng fallback. Set `VITE_TMDB_KEY` đúng cách (mục 2).
- **Ảnh poster không tải** → kiểm tra kết nối tới `image.tmdb.org`; ảnh TMDB không cần API key.
- **Tiếng Việt không đủ dữ liệu** → app gửi `language=vi-VN`; phim nào chưa có bản dịch sẽ tự trả về tiếng Anh.
