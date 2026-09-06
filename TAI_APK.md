# 📱 APK + giao diện điện thoại + UA Dalvik

Ba việc bro nhờ: **build APK**, **giao diện y hệt nhưng tối ưu điện thoại**, **proxy dùng UA Dalvik/Chrome**.
Dưới đây là toàn bộ những gì đã làm và phần bro cần bấm tay (đúng 1 bước).

---

## 1. Proxy đổi sang UA Dalvik (mặc định) / Chrome — XONG

Trước đây worker giả `VLC/3.0.21` khi đi lấy luồng. Nhiều nguồn IPTV Việt chặn UA lạ, chỉ nhận UA của app Android.

**Thứ tự ưu tiên UA khi worker gọi lên nguồn:**

1. Header `X-CHRTV-Upstream-UA` do client gửi (theo lựa chọn trong Cài đặt).
2. UA riêng của kênh trong playlist (`#EXTVLCOPT:http-user-agent=...`) — chỉ dùng khi chọn chế độ *Theo từng kênh*.
3. Mặc định của server = **Dalvik**.

Hai chuỗi UA dùng chung cho cả worker lẫn client:

| Chế độ | Chuỗi UA |
|---|---|
| `dalvik` (mặc định) | `Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014)` |
| `chrome` | `Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36` |

**Đổi mặc định phía server** (không cần sửa code): thêm biến môi trường trên Cloudflare

```
UPSTREAM_UA_DEFAULT = dalvik      # hoặc: chrome, hoặc dán nguyên một chuỗi UA tuỳ ý
```

**Đổi phía người dùng:** *Cài đặt → Trình duyệt giả lập khi lấy luồng (UA)* → Dalvik / Chrome Android / Theo từng kênh.
Kênh nào 403 thì đá qua Chrome thử, khỏi phải sửa code.

Chỗ đã sửa: `worker/worker.js` (hằng `UA_DALVIK`, `UA_CHROME_ANDROID`, hàm `defaultUpstreamUA`, dùng ở `handleProxy`, `handleStreamProxy`, health-check), `src/services/streamGuard.js` (`upstreamUAFor`), `src/contexts/SettingsContext.jsx`, `src/components/SettingsPage.jsx`.

---

## 2. Giao diện tối ưu điện thoại — XONG (không đổi bố cục)

Giữ nguyên 100% layout/màu/thành phần, chỉ vá những chỗ cầm máy mới thấy khó chịu:

- `viewport-fit=cover` + `env(safe-area-inset-*)`: không bị **tai thỏ** che đầu trang, không bị **vạch home** đè thanh menu dưới.
- Thanh tab dưới: nền mờ (backdrop blur), nút bo góc, **vùng chạm ≥ 46×56px** đúng chuẩn Material/HIG, tab đang chọn có nền sáng nhẹ.
- `main` tự chừa khoảng dưới = chiều cao tab bar + safe area → hàng thẻ cuối không bị che.
- Bỏ **ô xanh nhấp nháy** khi chạm (`-webkit-tap-highlight-color`).
- Chặn **kéo quá đà lòi nền trắng** (`overscroll-behavior-y: none`).
- `input/select/textarea` cỡ chữ 16px → **iOS hết tự zoom** khi gõ ô đăng nhập.
- Tiêu đề co lại trên màn nhỏ, hàng cuộn ngang có **scroll-snap** cho mượt kiểu app.

Chỗ đã sửa: `index.html`, `src/index.css`, `src/components/Sidebar.jsx`.

**Xem thử ngay:** mở đường dẫn `/phone.html` trên bản preview — có khung điện thoại thật (390×844, 360×800, Pixel 7 Pro, và cả xoay ngang), bấm được y như cầm máy.

---

## 3. APK — đã sửa xong pipeline, còn 1 nút bro bấm

### Vì sao mình không build thẳng ở đây được

Sandbox này **chặn mạng tới `dl.google.com`, `maven.google.com`, `services.gradle.org`** (chỉ npm + github đi được) và **không có Java/Gradle/Android SDK**. Không tải nổi Android SDK ⇒ bắt buộc build trên GitHub Actions.

### Vì sao 20 lần build trước đều đỏ

Soi log `build-android.yml` ra 4 lỗi cộng dồn:

| Lỗi | Hậu quả |
|---|---|
| Thiếu `npm ci` trước `npm run build` | `vite: command not found` → exit 127, chết ngay bước 3 |
| Dùng JDK 17 | Capacitor 7 + AGP 8.13 biên dịch mức Java 21 → `invalid source release: 21` |
| Cài `platforms;android-34` + `build-tools;34` | Dự án để `compileSdk 36` → không tìm thấy target |
| Cài gói `tv;android-34` (không tồn tại) | sdkmanager fail → job đỏ |
| `assembleRelease` **không có signingConfig** | Kể cả build xong cũng ra APK **chưa ký → máy Android từ chối cài** |

### Đã sửa

- `android/app/build.gradle`: thêm `signingConfigs.release` đọc keystore từ biến môi trường, **không có keystore thì rơi về debug key** để APK luôn cài được; `versionCode`/`versionName` nhận override từ CI (`-PCI_VERSION_CODE`, `-PCI_VERSION_NAME`) để mỗi bản build tự tăng version.
- `.github/workflows/build-android.yml`: workflow viết lại HOÀN CHỈNH (file cũ bị cắt cụt giữa dòng nên Action không bao giờ chạy — đó là lý do "không thấy file APK ở đâu"): `npm ci` → build web → `cap sync` → JDK 21 → SDK 36/build-tools 36 → keystore (secret > cache > tự sinh + cache giữ chữ ký ổn định) → `assembleRelease` → **artifact + TỰ ĐĂNG LÊN GITHUB RELEASE** (tag `latest`).

### Kích hoạt workflow (ĐÚNG 1 BƯỚC — bot không có quyền sửa file trong `.github/workflows/`)

Token của Arena **thiếu quyền `workflows`** nên không push được file `.github/workflows/build-android.yml`
(GitHub trả 403 cả git lẫn API). Workflow mới đã nằm sẵn trong repo ở **`ci/build-android.yml`**. Chọn 1 trong 2:

- **Cách 1 (30 giây):** mở <https://github.com/ankbuitv/ott/edit/arena/01a075fc-ott/.github/workflows/build-android.yml>,
  bôi đen xoá hết, dán nguyên nội dung **`ci/build-android.yml`** ([bản raw](https://github.com/ankbuitv/ott/blob/arena/01a075fc-ott/ci/build-android.yml)),
  commit thẳng vào nhánh `arena/01a075fc-ott`.
- **Cách 2:** reconnect GitHub trong Arena có quyền `workflows` rồi bảo agent push nốt commit cuối (đang chờ sẵn trong nhánh local).

> Làm xong bước này là MỌI lần push vào `main` tự build + tự đăng Release, không cần đụng gì thêm.

### Tải APK (không cần bấm gì thêm)

Workflow chạy tự động mỗi khi push vào `main` (hoặc chạy tay ở tab **Actions → Build Android APK (CHRTV) → Run workflow**). Xong bản build:

1. Mở repo → **Releases** → bản **"CHRTV PL▷Y Android APK (mới nhất)"** (tag `latest`).
2. Tải `CHRTV-PLAY-<phiên bản>.apk` — luôn là bản mới nhất, link không đổi nên chia sẻ 1 link là đủ.
3. Bản build trên nhánh khác (`arena/**`, PR) chỉ nằm trong **Artifacts** của run (giữ 30 ngày), không đăng Release.

> Muốn bật/tắt việc đăng Release khi chạy tay: input `publish` trong **Run workflow** (mặc định bật).

### Lưu ý khi cài

- Android sẽ hỏi *"Cài ứng dụng không rõ nguồn gốc"* → cho phép trình duyệt/File manager.
- Chữ ký APK: nếu chưa set secret `ANDROID_KEYSTORE_BASE64`, CI **tự sinh keystore và cache lại theo key cố định** → các bản build sau dùng CHUNG một chữ ký, cài đè trực tiếp không cần gỡ bản cũ.
  Muốn tự quản chữ ký hoàn toàn (an toàn hơn, dùng luôn cho Play Store) thì tạo keystore cố định rồi lưu vào repo secret:

  ```bash
  keytool -genkeypair -v -keystore chrtv-release.jks -alias chrtv \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass 'MẬT_KHẨU' -keypass 'MẬT_KHẨU' \
    -dname "CN=CHRTV PLAY, O=ANKB, C=VN"
  base64 -w0 chrtv-release.jks       # copy chuỗi này
  ```

  GitHub → Settings → Secrets → Actions → thêm `ANDROID_KEYSTORE_BASE64` (+ nếu đổi mật khẩu thì thêm `CHRTV_KEYSTORE_PASSWORD`, `CHRTV_KEY_ALIAS`, `CHRTV_KEY_PASSWORD`).
  **Giữ kỹ file `.jks` này** — mất là không update app cũ được nữa.
- App trỏ về domain production trong `capacitor.config.json`; đổi domain thì sửa file đó rồi build lại.
- Manifest đã có sẵn cả `LAUNCHER` lẫn `LEANBACK_LAUNCHER` nên APK này **cài lên Android TV box chạy luôn**.

---

## 5. Bản cập nhật ngày 06/09 (theo yêu cầu mới)

| Yêu cầu | Trạng thái | Chi tiết |
|---|---|---|
| Proxy whitelist tất cả link | ✅ | Bỏ danh sách domain cố định — `PROXY_ALLOW_ALL=1` mặc định. Link nào cũng proxy được. Vẫn chặn IP nội bộ/reserved (SSRF), `localhost/.local/.internal`, scheme khác http(s), rate-limit 60 req/phút/IP và anti-tool cho `.m3u8`. Muốn siết lại: đặt env `PROXY_ALLOW_ALL=0`. |
| Link M3U mặc định | ✅ | `https://github.com/ankbuitv/mytv/raw/refs/heads/main/playlist.m3u`. ⚠️ Hiện link này trả **404** (repo private hoặc chưa có file) → worker tự rơi về playlist cũ. Cách xử lý ở dưới. |
| Trang chủ không quảng cáo | ✅ | Gỡ `AdSlot` khỏi `HomePage.jsx`. Banner còn lại ở Phim/Cộng đồng, pre-roll vẫn theo luật gói cũ. |
| Nút Cài đặt trên điện thoại | ✅ | Thanh dưới giờ là **4 tab chính + nút THÊM** → mở bảng trượt chứa SPORT / SHORTS / CỘNG ĐỒNG / **CÀI ĐẶT** / **QUẢN TRỊ** + hồ sơ. Trước đây `navItems.slice(0,5)` cắt mất Cài đặt nên trên máy không có đường vào. |
| Làm đẹp hơn | ✅ | Tab bar kính mờ + vạch gradient báo tab đang mở, bảng trượt bo góc có animation, thanh cuộn mảnh tông tối, thẻ nhấc nhẹ khi rê chuột, gạch gradient dưới tiêu đề mục. |
| UA: Dalvik → VLC → Chrome | ✅ | Mặc định Dalvik. Nguồn trả 401/403/404/405/406/410/429/451/5xx hoặc lỗi mạng → tự thử VLC → cuối cùng Chrome, áp cho cả `/api/proxy` và `/api/stream/proxy`. Đã test giả lập: nguồn chặn Dalvik thì VLC lên hình. Cài đặt cho chọn UA thử đầu tiên (Dalvik/VLC/Chrome/Theo kênh). |
| Token xoay 5 phút | ✅ | `STREAM_TOKEN_ROTATE = 300s`, TTL = 330s (dư 30s để đổi không giật), client xoay ở mốc `exp-30` = đúng phút thứ 5. |
| Tên app / package / version | ✅ | `CHRTV PL▷Y`, `com.chrtvplay.app`, `1.0.0-beta` (versionCode 1). Đổi trong `capacitor.config.json`, `strings.xml`, `build.gradle`, `package.json`, tiêu đề web, mục Cài đặt → Giới thiệu. Java package đổi theo: `android/app/src/main/java/com/chrtvplay/app/MainActivity.java`. |

### Sửa thêm 1 lỗi ngầm sẽ làm APK "trắng dữ liệu"

Capacitor chạy web ở `https://localhost`, mà `src/services/config.js` thấy protocol là `https:` nên coi là same-origin → mọi API gọi về `https://localhost/api/...` = chết. Đã thêm `isNativeApp()`: trong APK tự trỏ về `https://play.ankb.qzz.io`. Kèm theo worker đã thêm `https://localhost`, `capacitor://localhost` vào CORS allowlist, nếu không APK bị chặn CORS sạch.

### Playlist mytv đang 404 — chọn 1 trong 3 cách

1. **Để repo `ankbuitv/mytv` ở chế độ public** → link chạy ngay, không cần làm gì thêm.
2. Repo private: tạo token đọc rồi
   `npx wrangler secret put GITHUB_RAW_TOKEN` (worker tự gắn `Authorization: Bearer ...` khi tải link github).
3. Hoặc trỏ nguồn khác: `npx wrangler secret put M3U_SOURCE_URL` (một link), hoặc biến `M3U_SOURCE_URLS = "url1,url2"` để thử lần lượt.

Thứ tự nạp hiện tại: `M3U_SOURCE_URL` → `M3U_SOURCE_URLS` → mytv/playlist.m3u → playlist cũ trong repo ott → danh sách kênh mặc định trong code.

### Cài APK mới

Package đổi từ `com.chrtv.app` sang `com.chrtvplay.app` nên Android coi đây là **app khác**: bản cũ vẫn nằm im, cài bản mới không đè. Gỡ bản cũ cho gọn máy.
