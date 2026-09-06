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

- `android/app/build.gradle`: thêm `signingConfigs.release` đọc keystore từ biến môi trường, **không có keystore thì rơi về debug key** để APK luôn cài được; `versionCode 2` / `versionName 1.1.0`. → *đã push*
- `ci/build-android.yml`: workflow viết lại đủ `npm ci` → JDK 21 → SDK 36/build-tools 36 → **keytool tự sinh keystore** → `assembleRelease` + `assembleDebug` + `bundleRelease`, artifact đổi tên đẹp `CHRTV-PLAY-release.apk`, thêm trigger cho nhánh `arena/**`. → *đã push, nhưng nằm ở thư mục `ci/`*

### Bước bro bấm (2 phút)

Token của bot **không có quyền `workflows`** nên mình không được phép ghi đè file trong `.github/workflows/` (GitHub trả 403 cả khi push lẫn khi gọi API). Nên:

1. Mở: <https://github.com/ankbuitv/ott/edit/arena/01a0759f-ott/.github/workflows/build-android.yml>
2. Bôi đen xoá hết, **dán nguyên nội dung file `ci/build-android.yml`** trong repo.
3. Commit thẳng vào nhánh `arena/01a0759f-ott`.
4. Vào tab **Actions** → run "Build Android APK (CHRTV)" → chờ ~8–12 phút.
5. Kéo xuống mục **Artifacts** → tải **`chrtv-apk`** (trong đó có `CHRTV-PLAY-release.apk` và bản `debug`).

> Cách khác nếu bro thích: vào **Settings → GitHub Apps → Arena** cấp quyền `workflows`, nhắn mình một tiếng là mình push thẳng, khỏi copy-paste.

### Lưu ý khi cài

- Android sẽ hỏi *"Cài ứng dụng không rõ nguồn gốc"* → cho phép trình duyệt/File manager.
- CI đang **tự sinh keystore mỗi lần build** ⇒ chữ ký khác nhau giữa các bản → muốn cài bản mới phải **gỡ bản cũ** trước.
  Muốn cập nhật đè lên (giữ dữ liệu, sau này lên Play Store được) thì tạo keystore cố định rồi lưu vào repo secret:

  ```bash
  keytool -genkeypair -v -keystore chrtv-release.jks -alias chrtv \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass 'MẬT_KHẨU' -keypass 'MẬT_KHẨU' \
    -dname "CN=CHRTV PLAY, O=ANKB, C=VN"
  base64 -w0 chrtv-release.jks       # copy chuỗi này
  ```

  GitHub → Settings → Secrets → Actions → thêm `ANDROID_KEYSTORE_BASE64` (+ nếu đổi mật khẩu thì sửa 3 biến `CHRTV_KEYSTORE_PASSWORD`, `CHRTV_KEY_ALIAS`, `CHRTV_KEY_PASSWORD` trong workflow).
  **Giữ kỹ file `.jks` này** — mất là không update app cũ được nữa.
- App trỏ về domain production trong `capacitor.config.json`; đổi domain thì sửa file đó rồi build lại.
- Manifest đã có sẵn cả `LAUNCHER` lẫn `LEANBACK_LAUNCHER` nên APK này **cài lên Android TV box chạy luôn**.
