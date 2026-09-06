# 🛡 CHỐNG RIP LINK M3U8 — vì sao tool vẫn lấy được và đã vá thế nào

> **⚠️ CẬP NHẬT 2026-09: ĐÃ BỎ PROXY LÀM MẶC ĐỊNH (`STREAM_MODE=direct`).**
> Nhiều nguồn IPTV (FPT, TV360, VTVgo…) chặn dải IP egress của Cloudflare Workers nên
> khi stream đi qua `/api/stream/proxy` người xem toàn thấy 403/đứng hình — đủ thứ lớp
> bảo vệ mà không xem được là vô nghĩa. Giữ lại: `/api/playlist` vẫn CHỈ trả metadata,
> `/api/stream/token` vẫn kiểm tra đăng nhập + gói cước + xem thử + chống flood phía
> server, chỉ khác là sau khi kiểm tra xong server **trả thẳng URL gốc** cho client phát
> trực tiếp (nguồn thấy IP người xem, không bị chặn). Muốn bật lại toàn bộ luồng proxy
> bên dưới (giấu link gốc khỏi DevTools): set biến môi trường `STREAM_MODE=proxy` cho
> Worker — client tự động chuyển sang `proxy_url`, không cần build lại app.

## 1. Vì sao “bảo mật đủ thứ” mà tool chuyên nghiệp vẫn lấy được link gốc?

Vì link gốc **được phát công khai ở 3 chỗ**, chẳng cần tool giỏi:

| # | Lỗ rò | Bằng chứng | Ai cũng khai thác được |
|---|---|---|---|
| 1 | `/api/playlist` trả nguyên `stream_url` của mọi kênh, **không cần đăng nhập** | `curl https://play.ankb.qzz.io/api/playlist` → JSON đầy link `.m3u8` thật | ✅ 1 dòng lệnh |
| 2 | File playlist gốc nằm trong thư mục `public/` nên vào thẳng bản build | `curl https://play.ankb.qzz.io/playlists/tv.m3u` → toàn bộ 155 kênh + URL thật | ✅ 1 dòng lệnh |
| 3 | Client phát **thẳng** URL gốc (`streamGuard.js` bản cũ ghi rõ: “bỏ proxy hoàn toàn”) | Mở F12 → tab Network thấy `live-a.fptplay53.net/...m3u8`; Charles/Fiddler cũng vậy | ✅ mở DevTools |

Khi URL thật đã nằm trong tay client thì **mọi lớp chặn khác đều vô nghĩa**: chặn F12,
chặn chuột phải, chặn UA của curl/VLC… đều chỉ làm khó người dùng thường, không làm khó
người biết dùng proxy sniffer. Hạ tầng token + proxy trong Worker (`/api/stream/token`,
`/api/stream/proxy`) vốn đã được viết rất tốt — nhưng client **không dùng tới**.

## 2. Đã vá gì

### Server (`worker/worker.js`)

1. **`/api/playlist` & `/api/channels` không còn `stream_url`, `user_agent`, `referer`.**
   Response chỉ còn metadata + cờ `protected: true`.
   Công tắc khẩn cấp: secret `PUBLIC_STREAM_URL=1` (bật lại chế độ cũ khi cần cứu sự cố).
2. **Chặn mọi file `.m3u/.m3u8/.mpd` phục vụ kiểu static** (`/playlists/tv.m3u`, `/tv.m3u`…) → 404.
3. **TTL token phát**: manifest 300s (chỉnh bằng `STREAM_MANIFEST_TTL`, 60–1800s),
   segment live 60s, segment VOD/catch-up 4 giờ (playlist có `#EXT-X-ENDLIST` không được
   tải lại nên token phải sống đủ dài — trước đây 60s là VOD chết giữa chừng).
4. **Chống rip hàng loạt**: 1 phiên chỉ xin được 240 token phát / 5 phút; vượt ngưỡng →
   429 + ghi `analytics` sự kiện `stream_token_flood`. Client bị chặn (UA curl/VLC/ffmpeg,
   header proxy tool) ghi `stream_tool_blocked` để admin truy vết.
5. **Thu hồi phiên có hiệu lực thật**: `getAuth()` giờ đối chiếu bảng `sessions` —
   trước đây chỉ kiểm chữ ký JWT nên “đăng xuất thiết bị”, đổi mật khẩu hay ban user
   **không cắt được** token đã lộ (còn sống tới 30 ngày).
6. **Nguồn M3U có thể để riêng tư**: secret `M3U_SOURCE_URL` thay cho link GitHub public.

### Client

7. **`src/services/streamGuard.js` viết lại**: xin `/api/stream/token?channel=<id>` kèm JWT
   (user hoặc guest) → phát bằng `proxy_url` tuyệt đối (chạy cả trong Capacitor/Android TV
   vốn không có origin http). Tự **xoay token** trước khi hết hạn và xoay ngay khi proxy trả
   401/403 → xem liền mạch.
8. **`VideoPlayer.jsx` + `TVPage.jsx`**: nhận diện URL proxy là HLS (URL không có đuôi `.m3u8`),
   gắn header `X-CHRTV-Client`/`X-CHRTV-Upstream-*` cho hls.js (`xhrSetup`) và shaka
   (`registerRequestFilter`), tự nạp lại nguồn khi xoay token.
9. **Gỡ `public/playlists/tv.m3u`** khỏi bản build; `api.js` không còn fallback “tải M3U local”.
   File nguồn vẫn nằm ở `playlists/tv.m3u` trong repo để cron/Worker nạp vào D1.

## 3. Kết quả đo được (Worker local + origin HLS giả lập)

```
/api/playlist                       -> 0 lần xuất hiện chuỗi "stream_url"
/playlists/tv.m3u, /tv.m3u          -> 404
GET /api/stream/proxy?t=… (đúng phiên trình duyệt)      -> 200, playlist đã viết lại
   (mọi URI con thành /api/stream/proxy?t=…, KHÔNG còn origin thật)
cùng link đó, User-Agent khác        -> 403 TOKEN_SID_MISMATCH
cùng link đó, curl trần              -> 403
cùng link đó, VLC                    -> 403
```

Bộ `scripts/acceptance-test.sh` đã thêm mục **[12] CHỐNG RIP LINK M3U8** kiểm tra tự động
các trường hợp trên (38/38 pass).

## 4. Cần làm khi deploy

```bash
# 1) (khuyến nghị) chuyển nguồn M3U sang link riêng tư, không để công khai trên GitHub
npx wrangler secret put M3U_SOURCE_URL

# 2) deploy
npm run build && npx wrangler deploy

# 3) kiểm tra thật trên production
curl -s https://play.ankb.qzz.io/api/playlist | grep -c stream_url    # phải = 0
curl -s -o /dev/null -w '%{http_code}\n' https://play.ankb.qzz.io/playlists/tv.m3u  # phải 404
BASE=https://play.ankb.qzz.io bash scripts/acceptance-test.sh
```

> ⚠️ **Repo GitHub đang public** nên `playlists/tv.m3u` vẫn tải được từ github.com.
> Muốn kín hoàn toàn: chuyển repo sang private (hoặc bỏ file playlist khỏi repo và
> chỉ nạp từ `M3U_SOURCE_URL`), rồi đổi `SOURCE_M3U_URL` mặc định.

## 5. Nói thẳng về giới hạn

Không hệ thống HLS nào **không DRM** chặn được 100%: người dùng đã đăng nhập hợp lệ
luôn có thể ghi lại luồng của chính họ (screen record hoặc dump segment bằng đúng phiên).
Cái thực tế đạt được:

- Không ai lấy link **mà không có tài khoản** nữa (trước đây chỉ cần 1 lệnh curl).
- Link không **chia sẻ được**: bind user + IP + UA, TTL ngắn, tự hết hạn.
- Rip hàng loạt bị chặn ngưỡng + ghi log để khoá tài khoản.
- Muốn chặt hơn nữa: bật **giới hạn thiết bị đồng thời theo gói** (mục 21 trong
  `50_TINH_NANG_DE_XUAT.md`), **watermark ID người dùng** chèn lên hình, và với nội dung
  bản quyền cao thì phải dùng **DRM Widevine/PlayReady** thay ClearKey.
