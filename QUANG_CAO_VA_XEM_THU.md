# 📺 Quảng cáo pre-roll & xem thử 5 phút (gói Standard)

Hai luật này do chủ app chốt, **server quyết định hết** — client chỉ hiển thị, nên sửa app
hay chặn request cũng không lách được.

---

## 1. Quảng cáo trước khi vào kênh / phim

| Gói | Quảng cáo | Bỏ qua sau |
|---|---|---|
| **Standard** (và khách chưa đăng nhập) | Có | **30 giây** |
| **Recreational** | Có | **10 giây** |
| **Ultimate** | Có | **5 giây** |
| **Elite** | ❌ Không có | — |
| **Signature** | ❌ Không có | — |

- **Tối đa 5 quảng cáo mỗi giờ** cho mỗi người xem. Hết quota thì mở kênh/phim vào thẳng.
- Bộ đếm nằm ở **server** (bảng `ad_views`, đếm ngay khi server phát quảng cáo ra), tính theo
  `user_id` với người đã đăng nhập và theo `sid` (IP + thiết bị) với khách.
- Chạy cho **cả kênh live và phim**. Video quảng cáo hết là vào luôn; ảnh tĩnh thì tự đóng
  sau thời gian bắt buộc + 3 giây.
- Trong màn quảng cáo luôn có nút **“Nâng gói — xem không quảng cáo”**.

### Thêm quảng cáo
Admin Panel → tab **Quảng cáo** → slot **`preroll — chạy trước kênh/phim`**.
Điền `video_url` (mp4) hoặc `image_url`, `link_url`, và thời gian chạy (`starts_at`/`ends_at`).
Không có quảng cáo nào ở slot `preroll` → app vào kênh thẳng, không chờ.

### Chỉnh số bằng biến môi trường (không cần sửa code)
```bash
wrangler secret put AD_MAX_PER_HOUR        # mặc định 5
wrangler secret put AD_SKIP_STANDARD       # mặc định 30 (giây)
wrangler secret put AD_SKIP_RECREATIONAL   # mặc định 10
wrangler secret put AD_SKIP_ULTIMATE       # mặc định 5
```
Đặt `0` = gói đó thành ad-free.

---

## 2. Gói Standard: xem thử mọi kênh 5 phút

- Gói Standard **bấm vào được mọi kênh**, kể cả Thể thao / Phim / Giải trí.
- Tổng thời gian xem các kênh ngoài gói là **5 phút mỗi giờ**. Hết thì kênh ngoài gói báo
  `PREVIEW_EXPIRED` + mời nâng gói, **các kênh TH (VTV/HTV/THVL…) vẫn xem thoải mái**.
- Quota tự đầy lại sau 60 phút kể từ lần xem thử đầu tiên.
- **Khách chưa đăng nhập không có xem thử** — bấm vào kênh ngoài gói sẽ được mời đăng nhập
  (đây là mồi câu tài khoản: “đăng nhập để xem thử 5 phút miễn phí”).

### Cách server tính thời gian (không tin client)
Mỗi lần cấp token phát cho kênh ngoài gói, server cấp token **chỉ sống 60 giây** và trừ luôn
60 giây vào quota. Player muốn xem tiếp thì phải xin token mới → lại trừ tiếp. Tắt app giữa
chừng thì chỉ mất tối đa 1 phút. Không cách nào “xem chùa” bằng cách chặn heartbeat.

Trong lúc xem thử, app hiện đồng hồ **“XEM THỬ — còn 4:12”** kèm nút *Nâng gói*.

### Chỉnh số
```bash
wrangler secret put STANDARD_PREVIEW_SECONDS  # mặc định 300 (5 phút)
wrangler secret put STANDARD_PREVIEW_WINDOW   # mặc định 3600 (mỗi giờ)
```
Đặt `STANDARD_PREVIEW_SECONDS=0` = tắt hẳn xem thử (quay lại chặn cứng như cũ).

---

## 3. API liên quan

| Endpoint | Việc |
|---|---|
| `GET /api/ads/preroll?kind=channel\|movie&ref=<id>` | Trả `{ad, skip_after, quota, shown}` hoặc `{ad:null, reason:'ad_free'\|'quota_reached'\|'no_inventory'}` |
| `POST /api/ads/impression` | Client báo đã xem xong / bỏ qua (thống kê) |
| `GET /api/preview/state` | Quota xem thử còn lại của người đang đăng nhập |
| `GET /api/stream/token` | Trả thêm `preview:{total,used,remaining}` khi đang xem thử; hết quota trả `403 PREVIEW_EXPIRED` |

Kiểm thử tự động: `scripts/acceptance-test.sh` mục **[14]** + phần `[4]` đã cập nhật theo luật mới
(**54/54 pass**).
