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

# 2. Chạy ứng dụng web giao diện Dev
npm run dev

# 3. Build ứng dụng Web & Đồng bộ sang Android Native
npm run build
npx cap sync android
```

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

### Bật lại Cloudflare D1 & KV (tùy chọn)

Mặc định config deploy **không bật binding D1/KV** vì ID trong `worker/wrangler.toml`
cũ chỉ là placeholder (`chrtv-d1-database-id`, `chrtv-epg-kv-id`) khiến
`wrangler deploy` báo lỗi. Worker tự động chạy chế độ dự phòng (danh sách kênh
M3U/default, EPG fetch trực tiếp, Favorites & Lịch sử xem lưu LocalStorage).
Muốn bật D1/KV thật:

```bash
# 1. Tạo tài nguyên trên Cloudflare
npx wrangler d1 create chrtv-db
npx wrangler kv namespace create EPG_KV

# 2. Tạo bảng dữ liệu (xem schema.sql)
npx wrangler d1 execute chrtv-db --remote --file=./schema.sql

# 3. Bỏ comment 2 block [[d1_databases]] & [[kv_namespaces]] trong wrangler.toml
#    và điền database_id / id thật từ Cloudflare Dashboard, sau đó:
npx wrangler deploy
```

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
