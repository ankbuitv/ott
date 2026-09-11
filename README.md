# CHRTV - Hệ Sinh Thái Ứng Dụng Xem Truyền Hình IPTV Đa Nền Tảng

CHRTV là hệ thống ứng dụng xem truyền hình IPTV chuyên nghiệp, cao cấp (Dark Mode FPT Play / Netflix style), hỗ trợ đa nền tảng: Web PC, Mobile và Android TV (hỗ trợ điều khiển bằng Remote D-pad hồng ngoại).

---

## 🏗 Kiến Trúc Hệ Thống & Tech Stack

### 1. Frontend (Client Core)
- **Framework**: Vite + ReactJS + TailwindCSS.
- **TV Spatial Navigation**: `@noriginmedia/react-spatial-navigation` quản lý Focus State tự động đổi viền/nền màu đỏ rực rỡ (`#dc2626`) khi active trên Android TV.
- **Player Core**: Shaka Player (tối ưu HLS delay thấp, tự động phát luồng dự phòng `http://bore.pub:30113/hls/index.m3u8` khi luồng chính lỗi).
- **Phim ảnh theo vị trí địa lý**: phát hiện quốc gia người xem qua `/api/geo` (Cloudflare IP geo `request.cf.country`, fallback timezone) → TMDB gọi kèm `region` + `language` riêng (poster đang chiếu, sắp chiếu, TV show bản địa, kho phim trộn theo vùng). Đổi khu vực thủ công bằng bộ chọn cờ 🌐 trong trang Phim.
- **Logo watermark khi phát**: đắp logo CỦA WEB lên khung hình ở trang TV / cửa sổ player / lúc xem m3u8. Admin chỉnh **vị trí theo từng kênh** bằng khung kéo 16:9 (9 điểm bám góc-cạnh, kéo tự do, cỡ/độ mờ/kiểu/màu + dòng mô tả), upload PNG là **tự chuyển sang SVG**; kênh có thể “tắt riêng”. Chi tiết: `LOGO_WATERMARK.md`.
- **Bảo mật & cộng đồng**: rate-limit đăng nhập (sai 5 lần/tài khoản hoặc 20 lần/IP → khoá 15 phút), 2FA TOTP (Google Authenticator), audit log admin, quản lý user (ban/promote/reset password), Watch Party xem chung có chat + reaction (D1 polling), Web Push VAPID, notification center, TMDB proxy cache edge (giấu api_key), PiP/Cast/AirPlay, data saver ≤480p, EPG 7 ngày (quá khứ + tương lai), My List + Tiếp tục xem phim, trang diễn viên & đề xuất phim, share deep link `?channel=ID&party=CODE`.
- **Mật khẩu tách khỏi `JWT_SECRET`**: hash dùng secret riêng `PASSWORD_PEPPER` (chưa set thì rơi về `JWT_SECRET`), khai báo `LEGACY_JWT_SECRETS`/`LEGACY_PASSWORD_PEPPERS` để hash theo secret cũ vẫn đăng nhập được rồi tự nâng cấp. Xoay `JWT_SECRET` chỉ thu hồi phiên, KHÔNG khoá mật khẩu user. Gõ đúng mật khẩu mà báo sai? Xem `DANG_NHAP_TROUBLESHOOT.md`.
- **Vận hành kênh**: nút “Báo kênh lỗi” 1 chạm, player tự gửi mã lỗi về server, bộ kiểm tra sức khoẻ luồng chạy nền (không cần cron), trang trạng thái công khai `/status`, tab Admin “Sức khoẻ kênh”.
- **Quảng cáo pre-roll**: chạy trước khi vào kênh/phim, tối đa 5 lần/giờ — Standard bỏ qua sau 30s, Recreational 10s, Ultimate 5s, Elite & Signature không quảng cáo (`QUANG_CAO_VA_XEM_THU.md`).
- **Xem thử 5 phút**: gói Standard bấm được mọi kênh nhưng chỉ xem 5 phút/giờ ngoài gói; hết thì còn kênh TH.
- **Đang hot**: bảng xếp hạng kênh theo 15 phút gần nhất (`/api/stats/trending`).
- **Mạng yếu / 4G**: tự hạ độ phân giải và báo cho người xem, tắt/bật trong Cài đặt.
- **Hiệu năng (fix lag 2026-09)**: EPG đánh chỉ mục 1 lần thay vì quét toàn bộ mỗi lần tra (web hết đơ khi mở player/Toast); player đệm 30s + tắt low-latency (hết đứng hình), tự thử lại khi mạng chập chờn.
- **Thể thao**: lịch thi đấu + **tỉ số tự cập nhật mỗi 60 giây** (trận đang đá lên đầu, nhãn LIVE), **BXH luôn lấy bảng mới nhất** từ API (TheSportsDB/OpenLigaDB) khi tab đang mở, F1 & motorsport.
- **🎁 Tặng gói quà kênh cho bạn bè**: Gói cước → *Tặng gói cho bạn bè* — chọn gói + số ngày (+ tên đăng nhập bạn bè để khoá mã chỉ họ nhận được, kèm lời nhắn) → nhận mã `CHRTV-XXXX-XXXX-XXXX` + link chia sẻ `?gift=CODE` (bạn mở link vào thẳng trang nhận quà). API: `/api/gifts/create` · `/api/gifts/mine` · `/api/gifts/redeem`.
- **Đổi mật khẩu ngay trong app**: Cài đặt → *Đổi mật khẩu* (đo độ mạnh, hiện/ẩn, tuỳ chọn “đăng xuất các thiết bị khác” — thu hồi phiên thật sự vì server đối chiếu bảng `sessions`).
- **Xác minh email bắt buộc khi đăng ký**: gửi mã 6 số qua Brevo, chưa xác minh không đăng nhập được (UI có nút gửi lại mã + cooldown); khi Worker chưa cấu hình `BREVO_API_KEY` thì rơi về `devCode` hiển thị ngay trên màn hình xác minh.

### 2. Backend / Infrastructure (Cloudflare Serverless)
- **Cloudflare Workers**: Đảm nhận Static Assets, API Routing, Proxy HLS chặn CORS và ẩn URL thật.
- **Cloudflare D1 Database**: Lưu danh sách Kênh (`channels`), Kênh yêu thích (`user_favorites`), Lịch sử xem (`watch_history`).
- **Cloudflare KV Storage**: Cache dữ liệu EPG XML/JSON đã parse với TTL 3600s để tốc độ phản hồi cực nhanh.

### 3. Mobile / TV Native App & CI/CD
- **CapacitorJS**: Đóng gói ứng dụng Native cho Mobile APK và Android TV APK (hỗ trợ Leanback Launcher).
- **GitHub Actions**: push vào `main` → tự build **APK release có chữ ký** (`npm ci` → vite build → cap sync → JDK 21 + SDK 36 → gradle assembleRelease) → **tự đăng lên GitHub Release** (tag `latest`, kèm checksum SHA-256) — vào repo → *Releases* để tải. Keystore: ưu tiên secret `ANDROID_KEYSTORE_BASE64`, chưa có thì CI tự sinh + cache để chữ ký ổn định giữa các bản (cài đè không cần gỡ). Chi tiết: `TAI_APK.md`.

---

## 📡 Các Nguồn Dữ Liệu Đầu Vào

- **Link Playlist M3U gốc**: `https://cdn.ankb.qzz.io/tv.m3u`
- **Link EPG XML gốc**: `https://epg.io.vn/epgc.xml`
- **Link Stream Backup (Fallback)**: `http://bore.pub:30113/hls/index.m3u8`
- **Logo CHRTV chính thức**: `https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png`
- **Logo watermark khi phát**: mặc định là `public/watermark.svg` (512×512, nền trong suốt, vẽ bằng path) — worker phục vụ qua `/api/watermark` + `/api/watermark/logo`; admin upload logo riêng (PNG/JPG/WEBP → tự bọc SVG, SVG → sanitize bỏ script/handler/link ngoài) mà không cần build lại app. Cấu hình theo kênh lưu ở bảng D1 `channel_watermark`.
- **Bảo vệ luồng (chống rip m3u8)**: `/api/playlist` CHỈ trả metadata (không có `stream_url`), mọi file `.m3u/.m3u8/.mpd` static bị chặn 404, client phải gọi `/api/stream/token` (JWT) — server kiểm tra đăng nhập + gói cước + quota xem thử rồi mới trả URL phát. **Từ 2026-09: phát TRỰC TIẾP URL gốc (bỏ proxy làm mặc định)** vì nhiều nguồn IPTV chặn dải IP Cloudflare Workers nên phát qua proxy toàn bị 403; bật lại chế độ proxy (giấu link, token AES-GCM bind IP/UA, xoay TTL ngắn) bằng biến `STREAM_MODE=proxy`. Chi tiết: `CHONG_RIP_STREAM.md`.
- **Chống "crash lúc có lúc không"**: `fetchChannels` có timeout 12s + cache danh sách kênh tốt cuối (`localStorage[chrtv_channels_v1]`), worker ghi kênh kiểu upsert-rồi-ẩn (không `DELETE` bảng trước khi INSERT, không có khoảnh khắc playlist rỗng) và gộp mọi request lạnh vào MỘT lần import M3U; lỗi render/JS tự gửi về **Admin → tab “Lỗi player”** (badge `APP`). Chi tiết: `CHONG_CRASH.md`.
- **Gói cước (tạm free)**: 5 bậc Standard → Signature, kích hoạt qua `/user/plan/activate`; hỗ trợ qua email support@ankb.qzz.io (không dùng SĐT).

---

## 🛠 Hướng Dẫn Khởi Chạy Cục Bộ (Local Development)

```bash
# 1. Cài đặt các thư viện phụ thuộc
npm install

# 2. Chạy ứng dụng web giao diện Dev (vite proxy /api,/auth,/user,/admin -> Worker production)
npm run dev

# 2b. (Tuỳ chọn) Chạy Worker + D1 ở local rồi trỏ web vào đó
npm run dev:api                                            # terminal 1 -> http://127.0.0.1:8787
VITE_DEV_API_TARGET=http://127.0.0.1:8787 npm run dev      # terminal 2 -> http://localhost:3000

# 3. Build ứng dụng Web & Đồng bộ sang Android Native
npm run build
npx cap sync android
```

### 🔌 Frontend gọi API ở đâu?

Toàn bộ base URL nằm ở **`src/services/config.js`** (không hardcode rải rác nữa):

| Môi trường | Base URL dùng |
|---|---|
| Web do Worker phục vụ (production) | **same-origin** — gọi `/api/...`, `/auth/...` (không lo CORS) |
| `npm run dev` | same-origin, vite dev server proxy sang `VITE_DEV_API_TARGET` |
| APK Android / Android TV (Capacitor) | `PRODUCTION_API_BASE` = `https://play.ankb.qzz.io` |
| Ghi đè thủ công | biến build `VITE_API_BASE`, hoặc `localStorage.chrtv_api_base` |

Xem `.env.example` để biết các biến môi trường build.

## ☁️ Deploy lên Cloudflare Workers (Web Production)

Cấu hình deploy nằm ở file **`wrangler.toml` tại thư mục gốc** (CI/CD chạy
`npx wrangler deploy` từ root nên config phải ở root):

```bash
# Build frontend (dist/) + deploy Worker kèm Static Assets lên Cloudflare
npx wrangler deploy
```

Wrangler sẽ tự động chạy `npm run build` (khối `[build]`) trước khi deploy.
Kết quả: Worker `chrtv-backend` phục vụ cả API (`/api/*`) lẫn giao diện web
đã build trong `dist/`.

### Bật lại Cloudflare D1 & KV (BẮT BUỘC nếu muốn dùng tài khoản)

> ⚠️ **Đăng ký / đăng nhập / profile / admin bắt buộc phải có D1.** Khi Worker
> chưa được bind D1, các API này trả về **503 kèm thông báo tiếng Việt rõ ràng**
> (`code: "NO_DB"`) thay vì lỗi 500 khó hiểu; phần xem kênh, EPG, favorites,
> lịch sử vẫn chạy bình thường (fallback M3U + LocalStorage).
>
> Worker **tự tạo đầy đủ bảng** (users, sessions, profiles, channels, EPG cache…)
> ngay lần gọi API đầu tiên, nên chỉ cần tạo database + bind là xong, không bắt
> buộc chạy tay `schema.sql`.

```bash
# 1. Tạo tài nguyên trên Cloudflare
npx wrangler d1 create chrtv-db          # copy database_id in ra màn hình
npx wrangler kv namespace create EPG_KV  # (tuỳ chọn) copy id

# 2. (Tuỳ chọn) Tạo sẵn bảng bằng schema.sql — Worker cũng tự tạo nếu bỏ qua
npx wrangler d1 execute chrtv-db --remote --file=./schema.sql

# 3. Bỏ comment block [[d1_databases]] (và [[kv_namespaces]] nếu cần) trong
#    wrangler.toml, dán database_id / id thật vào, rồi deploy:
npx wrangler deploy
```

> Lưu ý: `wrangler deploy` đồng bộ bindings theo `wrangler.toml`. Nếu bạn chỉ
> thêm binding trên Dashboard mà không ghi vào `wrangler.toml` thì lần deploy
> sau sẽ **mất binding** và lỗi "chưa bật D1" quay lại.


---

## 📦 Cấu Trúc Thư Mục Dự Án (Folder Tree)

```
ott/
├── .github/
│   └── workflows/
│       └── build.yml               # CI/CD GitHub Actions tự động build APK Android
├── android/                        # Dự án Native Android TV / Mobile (Capacitor)
│   └── app/
│       └── src/
│           └── main/
│               └── AndroidManifest.xml
├── public/                         # Tài nguyên tĩnh public
├── src/
│   ├── components/
│   │   ├── VideoPlayer.jsx         # Trình phát Shaka Player, Fallback Stream & Catchup URL
│   │   ├── StreamWatermark.jsx     # Lớp overlay logo của web lên khung hình (pointer-events: none)
│   │   ├── WatermarkStudio.jsx     # Khung kéo đặt vị trí logo (dùng trong Admin)
│   │   ├── EpgGridTimeline.jsx     # Ma trận Lịch phát sóng EPG 7 ngày & Catchup Grid
│   │   ├── ChannelCard.jsx         # Thẻ hiển thị kênh truyền hình
│   │   ├── Sidebar.jsx             # Thanh menu điều hướng Dark Mode
│   │   └── FocusableWrapper.jsx    # Wrapper hỗ trợ Spatial Navigation TV D-pad
│   ├── services/
│   │   ├── api.js                  # Gọi API Worker (+ timeout & cache danh sách kênh chống trắng app)
│   │   ├── clientErrors.js         # Bắt lỗi JS/render → gửi về Admin → "Lỗi player" (xem CHONG_CRASH.md)
│   │   └── watermark.js            # Đọc cấu hình logo + tính vị trí/kiểu cho overlay
│   ├── hooks/
│   │   └── useVideoContentRect.js  # Đo hộp ảnh thật của video (object-contain) để logo bám góc ảnh
│   ├── utils/
│   │   ├── dateUtils.js            # Xử lý thời gian EPG & phần trăm phát sóng
│   │   └── png2svg.js              # Chuyển PNG/JPG/WEBP → file SVG (cắt viền trong suốt + nhúng raster)
│   │   └── m3uParser.js            # Phân tích cú pháp playlist M3U
│   ├── App.jsx                     # Layout chính & Điều phối trạng thái
│   ├── main.jsx                    # Điểm khởi chạy React
│   └── index.css                   # TailwindCSS & Style Focus TV đỏ #dc2626
├── worker/
│   └── worker.js                   # Cloudflare Worker API Engine
├── wrangler.toml                   # Cấu hình Deploy Cloudflare (Worker + Assets + D1/KV)
├── capacitor.config.json           # Cấu hình Capacitor App (com.chrtv.app)
├── index.html                      # HTML Entry
├── package.json                    # Khai báo trọn bộ dependencies
├── schema.sql                      # Cloudflare D1 Database Setup
├── tailwind.config.js              # Cấu hình TailwindCSS Dark Theme
└── vite.config.js                  # Cấu hình Vite Build Tool
```
