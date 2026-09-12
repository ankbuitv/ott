# 🛡️ Bảo vệ luồng CHRTV — AES-128 + license server

Mã hoá **mọi luồng đi qua proxy** bằng AES-128 (chuẩn HLS `EXT-X-KEY`).
Bỏ link vào VLC / PotPlayer / trình tải HLS sẽ ra **đen hình**, vì chúng gọi
`https://license.ankb.qzz.io/k/<token>` mà không có token hợp lệ.

> ⚠️ Nói rõ để không ảo tưởng: đây **không phải Widevine/DRM**. AES-128 là mã hoá
> mức segment — chặn được copy link & tool tải, **không chặn được quay màn hình**.
> Muốn chống quay màn hình: `FLAG_SECURE` (Android) + watermark định danh.

---

## 1. Nó chạy thế nào

```
App (shaka/hls.js)
  │ 1. /api/stream/token (JWT + gói + xem thử)      → proxy_url
  │ 2. /api/stream/proxy  (playlist)
  │      └─ worker kéo playlist gốc, rewrite segment,
  │         chèn #EXT-X-KEY:METHOD=AES-128,URI="…/k/<token>",IV=0x…
  │ 3. /api/stream/proxy  (segment)  → AES-128-CBC mã hoá bằng key của phiên
  │ 4. license.ankb.qzz.io/k/<token> → đúng 16 byte key (octet-stream)
  ▼
giải mã bằng WebCrypto → phát
```

**Stateless** — key được *suy ra*, không lưu:

```
key = HMAC-SHA256(LICENSE_SECRET, "chrtv-aes-key-v1|" + token)[0..16]
iv  = HMAC-SHA256(LICENSE_SECRET, "chrtv-aes-iv-v1|"  + token)[0..16]
```

Worker chính và license worker **cùng secret → cùng token → cùng key**.
Không ghi KV/D1 trong đường phát (KV chỉ chịu ~1 write/key/giây, dùng cho
streaming là sập). Token tự hết hạn, không cần thu hồi thủ công.

Token payload: `{v,u(userId),s(hash phiên),c(kênh),b(bucket),e(hết hạn)}` + chữ ký HMAC.
Đổi user / đổi phiên / quá hạn → key khác hoặc 403.

---

## 2. Tự động bật, tự động né

**Tự bật**: mọi luồng đi qua `/api/stream/proxy` (tức là khi `STREAM_MODE=proxy`).

**Tự né** (không bao giờ làm hỏng phát — header `X-CHRTV-Protect` ghi rõ lý do):

| Lý do (`X-CHRTV-Protect`) | Khi nào |
|---|---|
| `fpt` | **FPT Play** (`fptplay`, `fpt-play`, `fpt.vn`, `fptcdn`, `/fptplay/…`) |
| `host` | host nằm trong `PROTECT_SKIP_HOSTS` |
| `channel_off` | kênh có `channels.protect = 0` (tắt trong Admin) |
| `master` | master playlist (con sẽ được xử lý riêng) |
| `encrypted` | upstream đã có `#EXT-X-KEY` (không mã hoá chồng) |
| `fmp4` | fMP4/CMAF (`#EXT-X-MAP`, `.m4s`, `.mp4`) — cần CENC/DRM thật |
| `byterange` | playlist dùng `#EXT-X-BYTERANGE` |
| `no_secret` | chưa cấu hình `LICENSE_SECRET` |
| `global_off` | `PROTECT=off` |

**Bật/tắt từng kênh**: Admin → tab **Bảo vệ luồng** → bấm `ĐANG BẬT / ĐANG TẮT`
(gọi `POST /admin/channel-protect {channel_id, protect}`).

---

## 3. Cài đặt (Workers Free, không cần thẻ)

### 3.1. Secret (bắt buộc, 2 bên PHẢI GIỐNG HỆT)

```bash
npx wrangler secret put LICENSE_SECRET                        # worker chính
npx wrangler secret put LICENSE_SECRET -c wrangler.license.toml
npx wrangler secret put ADMIN_SECRET   -c wrangler.license.toml
```

### 3.2. Deploy license server

```bash
npx wrangler deploy -c wrangler.license.toml
```

Rồi vào Dashboard → **chrtv-license** → *Settings → Domains & Routes → Add*
→ custom domain: **`license.ankb.qzz.io`** (Workers Free dùng được).

Kiểm tra:

```bash
curl https://license.ankb.qzz.io/health
# {"ok":true,"has_secret":true,"has_kv":false,...}
```

### 3.3. Deploy worker chính

```bash
npx wrangler deploy
```

Biến môi trường (thêm vào `[vars]` trong `wrangler.toml` nếu muốn đổi):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PROTECT` | `on` | `off` = tắt toàn cục (dùng khi có sự cố) |
| `LICENSE_BASE` | `https://license.ankb.qzz.io` | nơi cấp key; để trống → dùng `/lic/k/` cùng origin |
| `LICENSE_KEY_ROTATE` | `600` | xoay key mỗi bao nhiêu giây |
| `LICENSE_KEY_GRACE` | `1800` | key còn dùng thêm bao lâu sau khi xoay |
| `PROTECT_MAX_BYTES` | `8388608` | segment lớn hơn thì bỏ cuộc (CPU) |
| `PROTECT_SKIP_HOSTS` | rỗng | host cần né, cách nhau bởi dấu phẩy |
| `LICENSE_STRICT_IP` | `0` | `1` = khoá key theo IP (dễ rớt mạng 4G) |

> ⚠️ **`STREAM_MODE=proxy`** là điều kiện để bảo vệ có tác dụng (luồng phải đi qua
> worker). Chế độ `direct` (mặc định hiện tại) trả thẳng URL gốc → **không mã hoá
> được**. Bật proxy sẽ tốn CPU/request của Workers; cân nhắc Workers Paid nếu
> lượng xem lớn. Test nội bộ: `wrangler.dev.toml` đã bật sẵn proxy.

---

## 4. Giới hạn Workers Free & cách né

| Giới hạn | Cách xử lý trong code |
|---|---|
| 10 ms CPU/request | Segment đã mã hoá được **cache 45s** theo (URL gốc + bucket) → N người xem cùng kênh chỉ tốn 1 lần mã hoá |
| 100k request/ngày | Chỉ luồng qua proxy mới tốn; key được player gọi **1 lần** khi nạp playlist (không gọi mỗi segment) |
| Không có R2 | Không cần — mã hoá ngay tại chỗ, không lưu trữ |

---

## 5. Test

```bash
npm run test:protect        # 38 test đơn vị (offline, không cần mạng)
npm run test:protect-e2e    # 19 test end-to-end (cần worker local + HLS mẫu)
```

E2E dựng sẵn 3 kênh mẫu trên D1 local:

| Kênh | Kỳ vọng |
|---|---|
| `demo-ts` | có `#EXT-X-KEY`, segment mã hoá, giải mã = đúng bytes gốc |
| `demo-fpt` | **tự né** (header `fpt`), phát bình thường |
| `demo-off` | kênh tắt bảo vệ (header `channel_off`) |

---

## 6. File liên quan

| File | Vai trò |
|---|---|
| `worker/stream-protect.js` | Toàn bộ logic: token, key, AES, né FPT, chèn `EXT-X-KEY` |
| `worker/license-worker.js` | License server (`/k/<token>` + quản lý key dài hạn) |
| `wrangler.license.toml` | Cấu hình deploy license.ankb.qzz.io |
| `worker/worker.js` | `protectionPlan()` (playlist), `protectSegmentResponse()` (segment), `/lic/k/` |
| `src/components/AdminExtras.jsx` | Tab **Bảo vệ luồng** (bật/tắt từng kênh) |
| `scripts/protect-test.mjs`, `scripts/protect-e2e.mjs` | Test |
