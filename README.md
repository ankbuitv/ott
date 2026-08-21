# CHRTV - Hệ Sinh Thái Ứng Dụng Xem Truyền Hình IPTV Đa Nền Tảng

CHRTV là hệ thống ứng dụng xem truyền hình IPTV chuyên nghiệp, cao cấp (Dark Mode FPT Play / Netflix style), hỗ trợ đa nền tảng: Web PC, Mobile và Android TV (hỗ trợ điều khiển bằng Remote D-pad hồng ngoại).

---

## 🏗 Kiến Trúc Hệ Thống & Tech Stack

### 1. Frontend (Client Core)
- **Framework**: Vite + ReactJS + TailwindCSS.
- **TV Spatial Navigation**: `@noriginmedia/react-spatial-navigation` quản lý Focus State tự động đổi viền/nền màu đỏ rực rỡ (`#dc2626`) khi active trên Android TV.
- **Player Core**: Shaka Player (tối ưu HLS delay thấp, tự động phát luồng dự phòng `http://bore.pub:30113/hls/index.m3u8` khi luồng chính lỗi).

### 2. Backend / Infrastructure (Cloudflare Serverless)
- **Cloudflare Workers**: Đảm nhận Static Assets, API Routing, Proxy HLS chặn CORS và ẩn URL thật.
- **Cloudflare D1 Database**: Lưu danh sách Kênh (`channels`), Kênh yêu thích (`user_favorites`), Lịch sử xem (`watch_history`).
- **Cloudflare KV Storage**: Cache dữ liệu EPG XML/JSON đã parse với TTL 3600s để tốc độ phản hồi cực nhanh.

### 3. Mobile / TV Native App & CI/CD
- **CapacitorJS**: Đóng gói ứng dụng Native cho Mobile APK và Android TV APK (hỗ trợ Leanback Launcher).
- **GitHub Actions**: Tự động build APK Debug artifact khi push mã nguồn.

---

## 📡 Các Nguồn Dữ Liệu Đầu Vào

- **Link Playlist M3U gốc**: `https://cdn.ankb.qzz.io/tv.m3u`
- **Link EPG XML gốc**: `https://epg.io.vn/epgc.xml`
- **Link Stream Backup (Fallback)**: `http://bore.pub:30113/hls/index.m3u8`
- **Logo CHRTV chính thức**: `https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png`

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
│   │   ├── EpgGridTimeline.jsx     # Ma trận Lịch phát sóng EPG 7 ngày & Catchup Grid
│   │   ├── ChannelCard.jsx         # Thẻ hiển thị kênh truyền hình
│   │   ├── Sidebar.jsx             # Thanh menu điều hướng Dark Mode
│   │   └── FocusableWrapper.jsx    # Wrapper hỗ trợ Spatial Navigation TV D-pad
│   ├── services/
│   │   └── api.js                  # Gọi API Cloudflare Worker & D1/KV
│   ├── utils/
│   │   ├── dateUtils.js            # Xử lý thời gian EPG & phần trăm phát sóng
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
