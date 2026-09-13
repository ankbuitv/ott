# 📺 TEST CARD — Worker trang test link m3u8 / mpd

Một file worker duy nhất, không cần build, deploy riêng không đụng gì worker chính.

## Định dạng link

| Link | Ý nghĩa |
|---|---|
| `https://<worker>/test.m3u8` | Trang test card cho **HLS** |
| `https://<worker>/test.mpd` | Trang test card cho **DASH** |
| `https://<worker>/test.m3u8?u=<base64url link thật>` | Gửi khách: mở trang là sẵn link, bấm phát |
| `https://<worker>/test.m3u8?url=<link thật>` | Như trên nhưng không cần base64 |
| `...&auto=1` | Mở là **tự phát** luôn |
| `https://<worker>/check?url=<link>` | API JSON kiểm tra link từ phía **server** (CORS, content-type, live/VOD, HTTP status...) |
| `https://<worker>/healthz` | Kiểm tra worker còn sống |

Mọi path kết thúc `.m3u8` / `.mpd` đều dùng được (VD `/vip.m3u8`, `/demo.mpd`).

## Tính năng

- **Test card SMPTE** (bảng màu truyền hình) + đồng hồ, nhìn phát là biết đang ở trang test.
- Tự nhận diện engine: dán `.m3u8` → HLS.js, dán `.mpd` → dash.js, tự động đổi.
- Bảng thông số realtime: độ phân giải, bitrate, buffer, **frame rơi**, latency (live), thời gian.
- **Kiểm tra server-side** `/check`: probe link từ Cloudflare (không vướng CORS của browser) —
  báo HTTP status, CORS header, content-type, sniff manifest (HLS master/media, DASH dynamic/VOD,
  số variant, bitrate tối đa...), kèm gợi ý nguyên nhân lỗi (hotlink, thiếu CORS, mixed content...).
- Nút **COPY LINK TEST**: đóng gói link thật thành `?u=<base64url>` để gửi khách/Zalo.
- 4 stream mẫu có sẵn để đối chiếu khi nghi link mình hỏng.
- Nhật ký (log) từng sự kiện manifest/quality/error ngay trên trang.

## Deploy

```bash
npx wrangler deploy -c wrangler.test-card.toml
```

Xong là có ngay `https://test-card.<subdomain>.workers.dev/test.m3u8`.
Muốn chạy trên domain riêng thì thêm `routes` vào `wrangler.test-card.toml`.

Đổi tên thương hiệu trên trang: sửa `BRAND` trong `[vars]` của `wrangler.test-card.toml`.

## Code

- Worker: `worker/test-card-worker.js`
- Config: `wrangler.test-card.toml`
