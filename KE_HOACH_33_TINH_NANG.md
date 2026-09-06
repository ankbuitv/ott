# 🗺️ Kế hoạch 33 tính năng bro đã chọn

Chốt từ `50_TINH_NANG_DE_XUAT.md`: **1, 2, 3, 6, 13, 20 · cả nhóm 3 (21→30) · 32, 33, 34, 35, 36, 38 · 39, 40, 41, 42, 43, 45 · cả nhóm 6 (46→50)**
→ 33 tính năng. Ước tính tổng: **~9–11 tuần** làm tuần tự.

Xếp lại theo **thứ tự thi công** (cái nào sửa đau nhất + rẻ nhất lên trước, cái nào phụ thuộc cái khác thì xuống sau), không theo số thứ tự trong file gốc.

---

## Đợt 1 — Hết cảnh "kênh chết mà không biết" (~5 ngày)

| # | Tính năng | Cần thêm gì | Công |
|---|---|---|---|
| 20 | Nút **Báo kênh lỗi** | bảng `channel_reports`, `POST /api/report-channel`, tab Admin | S |
| 49 | **Xuất log lỗi player về server** | bảng `player_errors`, hook lỗi hls.js/shaka → `POST /api/telemetry/player` | S |
| 46 | **Cron kiểm tra sức khoẻ kênh** | job ping từng luồng, cột `channels.health`, tự ẩn kênh chết, bắn Telegram | M |
| 47 | **Status page công khai** | `/status` đọc từ 46 + uptime API | S |
| 3 | **Trang "Đang hot"** | dùng `watch_counters` sẵn có, xếp hạng 15 phút | S |
| 13 | **Tự hạ chất lượng + cảnh báo 4G** | `navigator.connection` + cấu hình ABR của hls.js | S |

> 20 + 49 + 46 là bộ ba ăn ý: user báo → server tự xác minh → kênh chết tự ẩn.

## Đợt 2 — Giữ chân người xem (~1.5 tuần)

| # | Tính năng | Cần thêm gì | Công |
|---|---|---|---|
| 1 | **Xem tiếp đa thiết bị** | `watch_progress` lên D1, đồng bộ 15s/lần | S |
| 2 | **Nhắc lịch qua Web Push** | bảng `epg_reminders` + cron bắn trước 10 phút (VAPID đã có) | S |
| 42 | **Tìm kiếm trong EPG 7 ngày** | index EPG vào D1/KV + `/api/epg/search` | S |
| 39 | **Tìm kiếm giọng nói** | Web Speech API + nút mic trên remote TV | S |
| 6 | **Timeshift thanh tua trực tiếp** | build URL timeshift + UI seek bar lùi 2h qua proxy | M |

## Đợt 3 — Nhóm 3 trọn bộ: tài khoản & bảo mật (~2.5 tuần)

| # | Tính năng | Cần thêm gì | Công |
|---|---|---|---|
| 21 | **Giới hạn thiết bị theo gói** | đếm `sessions` theo gói (Standard 1 → VIP 4), chặn/đá phiên cũ | M |
| 24 | **Nhật ký bảo mật cho user** | trang "Hoạt động đăng nhập" + nút thu hồi (bảng `sessions` đã đủ) | S |
| 27 | **Email cảnh báo đăng nhập lạ** | template Brevo + so IP/thiết bị lạ | S |
| 30 | **Tự khoá khi phát hiện rip** | nhiều IP/UA dùng chung token → khoá phiên + báo admin | M |
| 23 | **Backup code 2FA** | bảng `backup_codes`, 10 mã dùng 1 lần | S |
| 28 | **Xoá tài khoản & tải dữ liệu** | `/user/export`, `/user/delete` (xoá mềm 7 ngày) | S |
| 25 | **Vân tay/FaceID** | plugin Capacitor biometric thay PIN | S |
| 29 | **Thiết bị "nhà"** | đánh dấu 1 thiết bị chính, không tính vào giới hạn 21 | M |
| 22 | **Đăng nhập Google/Apple** | OAuth client + gộp tài khoản theo email | M |
| 26 | **Passkey / WebAuthn** | đăng ký + xác thực passkey, dự phòng mật khẩu | M |

> Thứ tự trong đợt này quan trọng: **21 → 29 → 30** đi liền nhau (cùng chạm bảng `sessions`), 22 và 26 làm cuối vì cần cấu hình bên ngoài (Google/Apple console, domain xác thực).

## Đợt 4 — Dòng tiền (~2 tuần)

| # | Tính năng | Cần thêm gì | Công |
|---|---|---|---|
| 32 | **Gói ngày / gói trận đấu** | loại gói mới hết hạn theo giờ, gắn với trận trong lịch thể thao | M |
| 35 | **Gia hạn tự động + nhắc hết hạn** | cron nhắc trước 3 ngày qua email/push, 1 chạm gia hạn | S |
| 33 | **Mã giới thiệu** | bảng `referrals`, mời bạn → cả hai +7 ngày | S |
| 36 | **Tặng gói cho bạn bè** | **mua mới được tặng** (đúng ý bro): thanh toán xong mới sinh mã trong `gift_codes` | S |
| 34 | **Quảng cáo pre-roll cho gói free** | slot ad 5–15s trước khi phát, VIP bỏ qua, đếm impression | M |
| 38 | **Affiliate cho streamer** | link riêng + bảng hoa hồng, rút tiền thủ công | M |

> ⚠️ Bro **không chọn số 31 (thanh toán tự động VietQR/SePay)**. Không có 31 thì 32/36/38 vẫn phải
> **xác nhận chuyển khoản bằng tay** trong Admin rồi mới kích hoạt/sinh mã. Cần quyết trước khi làm đợt này.

## Đợt 5 — Nội dung & khám phá (~2 tuần)

| # | Tính năng | Cần thêm gì | Công |
|---|---|---|---|
| 43 | **Trang chi tiết chương trình** | poster TMDB (đã tích hợp) + mô tả + "nhắc tôi" (dùng lại 2) | M |
| 41 | **Lịch thể thao gộp mọi giải** | nguồn lịch bóng đá/F1/tennis + map sang kênh phát | M |
| 40 | **Gợi ý cá nhân hoá** | tính theo `watch_history`, cache kết quả trong D1 | M |
| 45 | **Chế độ trẻ em** | danh mục hoạt hình + PIN + giới hạn giờ + báo cáo cho bố mẹ | M |

## Đợt 6 — Nền tảng & Android TV (~1 tuần)

| # | Tính năng | Cần thêm gì | Công |
|---|---|---|---|
| 48 | **Feature flag / A/B test** | bảng `flags` + `/api/flags`, bật theo % user | M |
| 50 | **Hàng "Tiếp tục xem" trên Android TV** | Leanback channel + watch-next provider (cần 1 để hoạt động) | M |

---

## Quyết định đã chốt với bro

1. **Không dùng cron** — mọi việc chạy nền đi theo request thật (`runDueJobs()` + bảng `jobs`).
   Không tốn cron trigger nào, không cần Workers Paid. Đánh đổi: app phải có người dùng thì
   việc nền mới chạy (app không ai vào thì cũng chẳng cần kiểm tra kênh).
   Các tính năng 2 (nhắc lịch), 35 (nhắc gia hạn), 40 (gợi ý) sẽ dùng chung cơ chế này.
2. **Thanh toán thủ công** — user chuyển khoản, admin vào duyệt rồi kích hoạt/sinh mã.
   Không làm số 31 (webhook VietQR/SePay). Ảnh hưởng: 32/36/38 đều đi qua bước duyệt tay.
3. **Quảng cáo (34)** — chưa chốt cách bán chỗ; sẽ hỏi lại khi tới đợt 4.

## Bảng nợ kỹ thuật kèm theo

- Các bảng D1 mới: `channel_reports`, `player_errors`, `watch_progress`, `epg_reminders`,
  `backup_codes`, `referrals`, `ad_impressions`, `affiliate_clicks`, `flags`, `kid_profiles`.
  Tất cả sẽ được thêm vào `ensureSchema()` để deploy là tự tạo, không cần chạy tay `schema.sql`.
- Test: mỗi đợt bổ sung section mới cho `scripts/acceptance-test.sh` (hiện 38 check).
