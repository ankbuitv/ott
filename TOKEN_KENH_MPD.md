# 🔑 Token Kênh .mpd (DASH) — gán `?token=` cho từng kênh trong Admin Panel

Nhiều nguồn DASH/DRM (ví dụ `sg002-cdw039026playnow.ankb.qzz.io/dashdrm/...`) yêu cầu
token nằm trong URL manifest. Tính năng này cho admin **gán token riêng cho từng kênh
có link `.mpd`** — khi có người xem, server **tự ghép** `?token=<giá trị>` vào URL phát,
client không cần biết hay cấu hình gì thêm.

## 1. Dùng thế nào

1. **Admin → tab "Token .mpd"** (bên cạnh "Chìa khoá stream").
2. Chọn kênh có link `.mpd` (danh sách lọc sẵn + ô tìm kiếm + badge `MPD`).
3. Nhập token (vd `Ken1402@`) → **Lưu token**.

Kết quả khi phát:

```
stream_url   = https://sg002-.../dashdrm/api/stream/GETdashdrm/6WT.../manifest.mpd
stream_token = Ken1402@
→ URL phát   = https://sg002-.../dashdrm/api/stream/GETdashdrm/6WT.../manifest.mpd?token=Ken1402@
```

- Kênh `.m3u8` **không** dùng tính năng này (token chỉ ghép cho URL `.mpd`).
- Nếu admin dán sẵn `?token=...` trong `stream_url` thì giá trị token trong Admin
  sẽ **ghi đè** param đó (dùng để rotate token nhanh mà không phải sửa URL).
- Ký tự đặc biệt an toàn (`@ : / !`) được giữ nguyên văn; chỉ mã hoá các ký tự phá
  cấu trúc query (`& # + %` khoảng trắng) để nguồn nhận đúng giá trị.

## 2. Bảo mật

| Lớp | Chi tiết |
|---|---|
| Không lộ qua API công khai | `/api/playlist`, `/api/channels` không trả `stream_token` (mapper `publicChannel` là whitelist) |
| Không lộ qua Admin GET | `/admin/channel-token` GET chỉ trả `has_token` + bản che `Ke••••2@`, không trả token thô |
| Audit log | Mỗi lần gán/xoá ghi `channel.token` vào bảng audit |
| Phát qua proxy | Token được seal bên trong opaque token `/api/stream/proxy?t=…` — không đi qua client |

> ⚠️ Lưu ý thực tế: kênh `.mpd` ở chế độ `STREAM_MODE=auto`/`direct` phát **trực tiếp**
> nên URL cuối (gồm token) xuất hiện ở phía client — điều tất yếu của chế độ direct
> (trình duyệt phải tự tải luồng). Muốn giấu tuyệt đối: `STREAM_MODE=proxy`, nhưng DASH
> qua proxy hiện chưa rewrite được MPD XML nên chỉ nên dùng cho kênh HLS.
> Ngoài ra nguồn `.mpd` cần cho phép CORS (hoặc xem trong APK Android — WebView Capacitor
> không bị chặn CORS) thì trình duyệt mới tự tải được manifest/segment.

## 3. Server — cách hoạt động

- **Cột mới** `channels.stream_token` (migration tự chạy bằng `ensureSchema`, không
  cần thao tác tay).
- `handleStreamToken`: sau khi giải mã kênh, `applyChannelStreamToken()` ghép
  `?token=` vào `targetUrl` trước khi cấp phát (cả nhánh direct lẫn nhánh proxy —
  nhánh proxy fetch upstream bằng URL đã chứa token).
- **Kênh `.mpd` ở chế độ `auto` luôn phát direct**: proxy chỉ rewrite được playlist
  m3u8; MPD XML đi qua nguyên xi nên segment URL tương đối sẽ resolve nhầm về
  `/api/stream/proxy` → vỡ. Phát trực tiếp là đường đúng cho DASH.
- `writeChannels` (import M3U) chuyển từ `INSERT OR REPLACE` sang
  `ON CONFLICT(channel_id) DO UPDATE` — **token và cờ `protect` không bị mất**
  mỗi lần import lại playlist (REPLACE xoá cả hàng nên trước đây mọi cấu hình
  admin đều bị reset).

## 4. API (admin)

```bash
# Danh sách kênh + trạng thái token (token chỉ hiện bản che)
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://play.ankb.qzz.io/admin/channel-token

# Gán / xoá token (token rỗng = xoá)
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" -H 'Content-Type: application/json' \
  -d '{"channel_id":"demo-mpd","token":"Ken1402@"}' https://play.ankb.qzz.io/admin/channel-token
curl -X DELETE -H "Authorization: Bearer <ADMIN_TOKEN>" -H 'Content-Type: application/json' \
  -d '{"channel_id":"demo-mpd"}' https://play.ankb.qzz.io/admin/channel-token
```

## 5. Test đã chạy (worker local + origin giả lập, 17/17 pass)

```
Admin GET  : nhận đúng kênh .mpd (is_mpd), kênh .m3u8 bỏ qua     ✅
Admin POST : lưu Ken1402@ → preview Ke•••2@, không trả token thô  ✅
Phát .mpd  : mode=direct (auto), url …manifest.mpd?token=Ken1402@ (giữ nguyên @) ✅
Phát .m3u8 : vẫn proxy-first như thường (không ảnh hưởng)        ✅
Không rò rỉ: /api/playlist, /api/channels không chứa token       ✅
Upsert kênh (POST /admin/channels không truyền token) → GIỮ token ✅
Import lại M3U (refresh) → token KHÔNG bị wipe                    ✅
DELETE    : xoá token → URL phát không còn ?token=                ✅
```
