# 🚀 50 TÍNH NĂNG MỚI ĐỀ XUẤT CHO CHRTV

Xếp theo **độ ưu tiên thực dụng**: cột “Sức nặng” = giá trị cho người dùng / doanh thu,
cột “Công” = ước lượng công sức (S = 1–2 ngày, M = 3–5 ngày, L = trên 1 tuần).
Mọi tính năng đều bám hạ tầng sẵn có: Cloudflare Worker + D1 + KV + React.

---

## 🔥 NHÓM 1 — GIỮ CHÂN NGƯỜI XEM (làm trước)

| # | Tính năng | Mô tả ngắn | Sức nặng | Công |
|---|---|---|---|---|
| 1 | **Xem tiếp kênh/phim đa thiết bị** | Lưu vị trí xem lên D1 thay vì localStorage — mở điện thoại là chạy tiếp đúng giây đang xem trên TV | ★★★★★ | S |
| 2 | **Nhắc lịch phát sóng qua Web Push** | Bấm chuông trên EPG → 10 phút trước giờ chiếu bắn push (VAPID đã có sẵn) | ★★★★★ | S |
| 3 | **Trang “Đang hot”** | Bảng xếp hạng kênh theo lượt xem 15 phút gần nhất (bảng `watch_counters` đã có) | ★★★★ | S |
| 4 | **Auto-play kênh cuối cùng khi mở app** | Bật/tắt trong Cài đặt; TV bật lên là có hình ngay | ★★★★ | S |
| 5 | **Multi-view 2×2 (xem 4 kênh cùng lúc)** | Dành cho bóng đá nhiều trận song song; audio chỉ 1 khung | ★★★★★ | M |
| 6 | **Timeshift thanh tua trực tiếp** | Kéo lùi tối đa 2 giờ với kênh có catch-up (server đã build được URL timeshift) | ★★★★★ | M |
| 7 | **Ghi hình đám mây (cloud DVR)** | Đặt lịch ghi chương trình → lưu R2 → xem lại trong “Bản ghi của tôi” | ★★★★★ | L |
| 8 | **Bỏ qua quảng cáo/ghi chú thời điểm hay** | Cộng đồng đánh dấu mốc “vào trận”, “hết hiệp” như SponsorBlock | ★★★ | M |
| 9 | **Danh sách phát cá nhân (playlist tự tạo)** | Gom kênh + phim vào bộ sưu tập, chia sẻ bằng link | ★★★ | S |
| 10 | **Chế độ “Chỉ âm thanh”** | Nghe kênh radio/bóng đá khi tắt màn hình — tiết kiệm 90% data | ★★★★ | S |

## 📺 NHÓM 2 — TRẢI NGHIỆM XEM

| # | Tính năng | Mô tả ngắn | Sức nặng | Công |
|---|---|---|---|---|
| 11 | **Chọn nhiều luồng/backup cho 1 kênh** | Mỗi kênh nhiều URL, tự nhảy nguồn khi lỗi, hiện “Nguồn 2/3” | ★★★★★ | M |
| 12 | **Đo & hiện chất lượng luồng** | Bitrate, độ trễ, số lần buffer ngay trên player (debug cho user) | ★★★ | S |
| 13 | **Tự hạ chất lượng khi mạng yếu + cảnh báo 4G** | Cảnh báo khi rời Wi-Fi để không tốn data | ★★★★ | S |
| 14 | **Phụ đề ngoài (.srt/.vtt) + dịch tự động** | Tải phụ đề, chỉnh cỡ chữ/màu/độ trễ | ★★★ | M |
| 15 | **Điều khiển bằng cử chỉ trên mobile** | Vuốt dọc trái = độ sáng, phải = âm lượng, đúp = tua 10s | ★★★★ | S |
| 16 | **Bàn phím tắt đầy đủ trên PC** | Space, ←/→, F, M, số 1-9 nhảy kênh, `?` mở bảng phím | ★★★ | S |
| 17 | **Sleep timer thông minh** | “Tắt sau khi hết trận / hết chương trình EPG hiện tại” | ★★★ | S |
| 18 | **Chống burn-in cho TV OLED** | Logo/đồng hồ tự dịch chuyển, giảm sáng khi đứng yên lâu | ★★ | S |
| 19 | **Zoom/khung hình: 16:9, 4:3, Fill, Zoom** | Nhiều kênh SD bị viền đen — user tự chỉnh | ★★★ | S |
| 20 | **Nút “Báo kênh lỗi”** | 1 chạm gửi channel_id + mã lỗi + thời điểm về Admin → dashboard kênh chết | ★★★★★ | S |

## 👤 NHÓM 3 — TÀI KHOẢN & BẢO MẬT

| # | Tính năng | Mô tả ngắn | Sức nặng | Công |
|---|---|---|---|---|
| 21 | **Giới hạn số thiết bị theo gói** | Standard 1, Recreational 2, VIP 4 — chặn share tài khoản tràn lan | ★★★★★ | M |
| 22 | **Đăng nhập bằng Google/Apple** | Bớt rào cản đăng ký, giảm quên mật khẩu | ★★★★ | M |
| 23 | **Mã khôi phục 2FA (backup codes)** | 10 mã dùng 1 lần khi mất điện thoại | ★★★ | S |
| 24 | **Nhật ký bảo mật cho user** | “Đăng nhập từ Biên Hoà lúc 21:03 — không phải bạn?” + nút thu hồi | ★★★★ | S |
| 25 | **Khoá app bằng vân tay/FaceID (Capacitor)** | Thay PIN 4 số trên mobile/TV | ★★★ | S |
| 26 | **Passkey / WebAuthn** | Đăng nhập không mật khẩu, chống phishing tuyệt đối | ★★★ | M |
| 27 | **Cảnh báo đăng nhập lạ qua email** | Brevo đã tích hợp — thêm template là xong | ★★★★ | S |
| 28 | **Xoá tài khoản & tải dữ liệu cá nhân** | Tuân thủ quyền riêng tư, tăng uy tín app | ★★ | S |
| 29 | **Chuyển vùng gói cước (thiết bị chính)** | Đánh dấu 1 thiết bị “nhà” để không bị tính là chia sẻ | ★★★ | M |
| 30 | **Cảnh báo & tự khoá khi phát hiện rip stream** | Nhiều IP/UA lạ dùng chung token → khoá phiên + báo admin | ★★★★★ | M |

## 💰 NHÓM 4 — DOANH THU

| # | Tính năng | Mô tả ngắn | Sức nặng | Công |
|---|---|---|---|---|
| 31 | **Thanh toán tự động VietQR/SePay** | Quét QR → webhook kích hoạt gói ngay (khung `/api/payments` đã có) | ★★★★★ | M |
| 32 | **Gói ngày / gói trận đấu** | 10–20k xem 1 trận, hợp thói quen người Việt | ★★★★★ | M |
| 33 | **Mã giới thiệu (referral)** | Mời bạn → cả hai +7 ngày VIP | ★★★★ | S |
| 34 | **Quảng cáo pre-roll cho gói free** | Chèn quảng cáo 5–15s khi mở kênh, VIP thì tắt | ★★★★ | M |
| 35 | **Gia hạn tự động + nhắc hết hạn** | Email/push trước 3 ngày, 1 chạm gia hạn | ★★★★ | S |
| 36 | **Tặng gói cho bạn bè (gift code)** | Bảng `gift_codes` đã có — thêm luồng mua tặng | ★★★ | S |
| 37 | **Dashboard doanh thu cho admin** | Doanh thu theo ngày/gói, tỉ lệ gia hạn, churn | ★★★ | M |
| 38 | **Affiliate cho streamer** | Link riêng + chia % cho người giới thiệu | ★★ | M |

## 🧠 NHÓM 5 — NỘI DUNG & KHÁM PHÁ

| # | Tính năng | Mô tả ngắn | Sức nặng | Công |
|---|---|---|---|---|
| 39 | **Tìm kiếm giọng nói (Web Speech + remote TV)** | “VTV3” bằng giọng nói — cực hợp Android TV | ★★★★ | S |
| 40 | **Gợi ý cá nhân hoá theo lịch sử xem** | “Vì bạn hay xem thể thao tối thứ 7…” (tính ở Worker, cache D1) | ★★★★ | M |
| 41 | **Lịch thể thao gộp mọi giải + nhắc trận** | Bóng đá, F1, tennis kèm nút “xem kênh phát” | ★★★★★ | M |
| 42 | **Tìm kiếm trong EPG 7 ngày** | Gõ tên phim/chương trình → biết chiếu kênh nào, giờ nào | ★★★★ | S |
| 43 | **Trang chi tiết chương trình** | Poster TMDB + mô tả + “nhắc tôi” + kênh phát | ★★★ | M |
| 44 | **Kênh cộng đồng (user tự thêm M3U công khai)** | Có kiểm duyệt, tăng nội dung mà không tốn chi phí | ★★★ | M |
| 45 | **Chế độ trẻ em có curation** | Chỉ kênh hoạt hình + giới hạn giờ + báo cáo cho bố mẹ | ★★★★ | M |

## 🛠 NHÓM 6 — VẬN HÀNH / KỸ THUẬT

| # | Tính năng | Mô tả ngắn | Sức nặng | Công |
|---|---|---|---|---|
| 46 | **Bộ kiểm tra sức khoẻ kênh tự động** | Cron ping từng luồng, kênh chết tự ẩn + báo Telegram | ★★★★★ | M |
| 47 | **Trang trạng thái (status page) công khai** | Uptime API/luồng để user khỏi nhắn tin hỏi | ★★★ | S |
| 48 | **A/B test & feature flag** | Bật tính năng cho 10% user trước khi mở toàn bộ | ★★ | M |
| 49 | **Xuất log lỗi player về server** | Gom mã lỗi shaka/hls theo kênh → sửa đúng chỗ | ★★★★ | S |
| 50 | **App TV: hàng “Tiếp tục xem” trên Leanback + kênh nổi bật Android TV** | Xuất hiện ngay màn hình chính Android TV, tăng lượt mở app | ★★★★ | M |

---

## Gợi ý lộ trình 3 giai đoạn

1. **Sprint 1 (1–2 tuần)** — số 20, 46, 11, 2, 1, 4, 42, 39: sửa đau nhất (kênh chết, lỗi phát) + giữ chân.
2. **Sprint 2 (2–3 tuần)** — số 21, 30, 31, 32, 33, 35: chặn chia sẻ tài khoản và bật dòng tiền.
3. **Sprint 3 (3–4 tuần)** — số 5, 6, 7, 40, 41, 50: các tính năng “wow” tạo khác biệt với app IPTV chợ.
