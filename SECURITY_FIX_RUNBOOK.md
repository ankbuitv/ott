# CHRTV — RUNBOOK BẢO MẬT (2026-09-05)

Phân công: **owner play.ankb.qzz.io** (có quyền Cloudflare Dashboard + Stream Engine).
Thứ tự BẮT BUỘC: §0 → §1 → §2 → §3 → §4 → §5. Không nhảy bước.

---

## 0. Thu hồi Admin Token đã lộ trên 2 Stream Engine (P0-A — khẩn)

Token `Ken1402@` đã lộ công khai (trước đây nằm trong `stream_url` trả về
`/api/playlist` và trong `playlists/tv.m3u` — **bản m3u mới đã xoá sạch**).
Ai lấy được token này là admin toàn quyền Stream Engine.

### 0.1. Làm trên MỖI engine (2 lần)

| Engine | Host |
|---|---|
| SG-001 | `sg001-cdw18826playnow.ankb.qzz.io` |
| SG-002 | `sg002-cdw039026playnow.ankb.qzz.io` |

1. Đăng nhập admin Stream Engine **bằng token cũ `Ken1402@`** (chưa rotate thì
   vẫn đăng nhập được).
2. Vào phần quản lý API/token → **xoá/revoke token `Ken1402@`** (hoặc đổi toàn
   bộ API token của engine).
3. Tạo **token admin MỚI** (ngẫu nhiên ≥ 32 ký tự, riêng cho MỖI engine).
   → Token mới này KHÔNG commit vào repo, KHÔNG gửi qua chat thường.
   **Giao token mới qua kênh riêng** (ví dụ: mật khẩu manager / mã hoá PGP /
   tin nhắn xoá sau đọc) — chỉ owner + người vận hành được biết.
4. Tạo **playback token MỚI cho từng kênh premium** (token phát, phân quyền
   thấp hơn admin — nếu engine hỗ trợ phân quyền token; nếu không, dùng 1 token
   playback chung khác với admin token). Ghi chú token mới của từng kênh.
5. Kiểm tra ngay: gọi endpoint stream của 1 kênh bằng token cũ → phải fail
   (401/403). Ví dụ:

```bash
# token cũ phải DEAD — mong đợi 401/403 (không phải 200/m3u8)
curl -is "https://sg001-cdw18826playnow.ankb.qzz.io/<đường-dẫn-kênh-premium-của-bạn>?token=Ken1402@" | head -3
curl -is "https://sg002-cdw039026playnow.ankb.qzz.io/<đường-dẫn-kênh-premium-của-bạn>?token=Ken1402@" | head -3
```

> ⚠️ Đây chính là **test [2]** của bộ acceptance (sandbox không ra internet
> nên test này bị skip tự động). **Bắt buộc** chạy tay ở bước 5.2 dưới đây
> sau khi deploy.

---

## 1. Set secrets cho Worker (Cloudflare)

Toàn bộ secret cũ trong repo (`JWT_SECRET` hardcode `snYhe…`, admin token
`Ken1402@`, các secret fallback) coi như **đã lộ** — phải thay hết.
Worker KHÔNG còn fallback secret cũ: không có secret = fail rõ (500 kèm
lỗi cấu hình), không tự ý dùng secret mặc định.

```bash
cd ott   # repo này

# Sinh giá trị ngẫu nhiên (mỗi lệnh 1 giá trị, ≥ 32 byte)
JWT_S=$(openssl rand -hex 32)
STREAM_S=$(openssl rand -hex 32)
ADMIN_S=$(openssl rand -hex 24)

wrangler secret put JWT_SECRET            # dán $JWT_S
wrangler secret put STREAM_TOKEN_SECRET   # dán $STREAM_S
wrangler secret put ADMIN_MASTER_TOKEN    # dán $ADMIN_S
wrangler secret put BREVO_API_KEY         # key Brevo hiện có (nếu đã có)
```

Secret tuỳ chọn (khuyến nghị bật):

```bash
# Chỉ cho IP/CIDR quản trị được gọi /admin/* (vd: IP nhà + IP VPS):
wrangler secret put ADMIN_ALLOWED_CIDRS   # ví dụ: "1.2.3.4, 5.6.7.0/24"
# Webhook cảnh báo mỗi lần có người chạm /admin/* (Telegram/Zapier/GitHub):
wrangler secret put ADMIN_ALERT_WEBHOOK
# Override whitelist upstream cho /api/proxy & /api/stream/token (mặc định
# trong code: fptplay53.net, fptplay.net, seenow.vn, mytvnet.vn, tv360.vn,
# vtvdigital.vn, vtv.sub.id, undo.it, cvtv.xyz, freem3u.xyz, kbs.co.kr,
# ankb.qzz.io, bore.pub:30113). Thêm bớt theo upstream thực tế:
wrangler secret put PROXY_ALLOWED_HOSTS   # ví dụ: "fptplay53.net,seenow.vn,vtv.sub.id"
# CORS allowlist (mặc định: origin same-app + play.ankb.qzz.io):
wrangler secret put CORS_ALLOWED_ORIGINS  # ví dụ: "https://play.ankb.qzz.io"
```

Kiểm tra:

```bash
wrangler secret list
# mong đợi: JWT_SECRET, STREAM_TOKEN_SECRET, ADMIN_MASTER_TOKEN (+ tuỳ chọn)
```

> **Cảnh báo:** sau khi set `ADMIN_MASTER_TOKEN`, cách login admin cũ bằng
> secret trong repo HẾT HIỆU LỰC — đúng như thiết kế (test [9] kiểm tra điều
> này). Admin đăng nhập qua tài khoản admin trong app (`/auth/login`, JWT
> role=admin) hoặc `Bearer $ADMIN_S`.

---

## 2. Deploy Worker + frontend

```bash
npm run build        # build Vite → dist/
wrangler deploy      # deploy worker.js + assets dist/ (config wrangler.toml)
```

Deploy là **ngắt ngắn** (vài giây) — thông báo trước cho user nếu giờ cao điểm.
Kênh FTA (VTV/HTV…) KHÔNG phụ thuộc Stream Engine → vẫn phát bình thường.
Kênh premium sẽ **đứt đến khi** làm xong §4 (bình thường, token cũ sắp chết).

---

## 3. Cloudflare: chặn /admin + WAF + rate limit

Trên Cloudflare Dashboard → zone `ankb.qzz.io` → subdomain `play`:

### 3.1. Cloudflare Access cho /admin (khuyến nghị — lớp 2 sau master token)

1. **Access → Applications → Add** → Self-hosted.
2. Application domain: `play.ankb.qzz.io`, policy:
   - Service Auth / Email + One-Time PIN (hoặc SSO nếu có).
   - Rule: `Host equals play.ankb.qzz.io` **and** `Path name starts with /admin`.
3. Chỉ thêm **owner + người vận hành** vào policy.

> Worker cũng tự khoá theo `ADMIN_ALLOWED_CIDRS` (§1) + log audit + alert
> webhook — ba lớp: token → CIDR → CF Access.

### 3.2. WAF / Rate Limiting (Cloudflare)

1. **Security → Rate limiting** → tạo rule:
   - `URI path starts with /auth` → 30 req/phút/IP (chống brute-force
     verify/login ở tầng edge, trước khi tới Worker).
   - `URI path starts with /api/stream` → 60 req/phút/IP.
2. **Security → WAF → Managed rules** → bật gói cơ bản (OWASP Core Rule Set)
   chế độ **Block** (đã test app không bị chặn ở bước §5).
3. (Tuỳ chọn) Custom rule block các User-Agent rip công khai:
   `ffplay`, `Lavf`, `python-requests`, `go-http-client`, `Wget`, `curl`
   trên đường dẫn `/api/stream/proxy` — Worker đã tự chặn, đây là lớp dư.

### 3.3. HSTS (bật ở Cloudflare)

**SSL/TLS → Edge Certificates** → bật **HSTS** (Max-Age ≥ 31536000, include
subdomains nếu toàn zone dùng https). Worker cũng tự thêm header HSTS cho mọi
response — bật ở CF là lớp dự phòng.

---

## 4. Nhập playback token MỚI vào app (kênh premium)

1. Mở app → đăng nhập **tài khoản admin** → **Admin Panel** → tab
   **Chìa khoá stream** (tab mới, icon chìa khoá).
2. Với MỖI kênh premium có token trên Stream Engine:
   - `channel_id`: đúng ID trong `playlists/tv.m3u` (vd `hbohd`).
   - Token: **playback token MỚI** vừa tạo ở §0.1 bước 4 (mục input ẩn mật).
   - Lưu → audit log ghi `stream_credential.rotate`, alert webhook báo về.
3. Kênh FTA: KHÔNG cần nhập gì — phát trực tiếp từ upstream công khai.

Worker tự inject token mới vào request fetch upstream
(`/api/stream/proxy`); token **không bao giờ** hiện trong response API,
URL client, hay m3u.

---

## 5. Kiểm tra sau deploy (chứng cứ)

### 5.1. Chạy bộ acceptance test với BASE production

```bash
cd ott
BASE=https://play.ankb.qzz.io ./scripts/acceptance-test.sh
```

Mong đợi: **tất cả ✅** (test [2] vẫn skip vì cần chạy tay — sang 5.2).
Lưu output làm bằng chứng.

### 5.2. Test [2] thủ công — token engine cũ phải dead

```bash
# Cả 2 engine, token cũ Ken1402@ → phải 401/403
curl -is "https://sg001-cdw18826playnow.ankb.qzz.io/<kênh-premium>?token=Ken1402@"  | head -3
curl -is "https://sg002-cdw039026playnow.ankb.qzz.io/<kênh-premium>?token=Ken1402@" | head -3
# token MỚI (qua proxy của app) → 200 m3u8
GT=$(curl -s -X POST https://play.ankb.qzz.io/auth/guest | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "https://play.ankb.qzz.io/api/stream/token?channel=<kênh-premium>" \
  -H "Authorization: Bearer $GT" -H "User-Agent: Mozilla/5.0" | head -c 200
```

### 5.3. Smoke test trải nghiệm user (trên máy thật, mobile/desktop)

| Kiểm tra | Mong đợi |
|---|---|
| Khách (không login) mở kênh VTV/HTV | Phát bình thường (guest JWT tự động) |
| Khách mở kênh premium | Hiện "cần đăng nhập" / "thuộc gói cao hơn" |
| User FREE mở kênh premium | "Thuộc gói cao hơn — vào Mua Gói" |
| User VIP mở kênh premium | Phát bình thường, không bị gián đoạn khi xem > 60s (token tự xoay) |
| Catchup (chương trình đã phát) | Cần login; phát đúng thời điểm đã chọn |
| Admin Panel | Mở được bằng tài khoản admin; tab Chìa khoá stream hoạt động |
| F12 / devtools | App chạy bình thường, không bị "kill" (guard cũ đã bỏ) |
| Phim/TV (mục embed) | Hiện "Chưa có nguồn phát hợp lệ" (embed không bản quyền đã tắt) |

### 5.4. Quan sát 24–48h đầu

- **Admin Panel → Nhật ký** (audit): xem ai chạm `/admin/*` (mỗi hành động
  admin đều ghi: user, IP, action).
- Alert webhook (§1) nếu đã set: kiểm tra Telegram/Zapier nhận được.
- Cloudflare Analytics → Traffic: quan sát 401/403 trên `/api/stream/*`
  (tăng vọt = có người dò token cũ — nếu vậy rotate lại §0).
- D1 `chrtv-db`: bảng `audit_log` (worker tự xoá > 90 ngày), `rate_limits`
  (tự dọn > 1 ngày).

---

## Phụ lục A — Luồng phát mới (để support nhanh)

```
User bấm kênh
  → App xin JWT: đã login = JWT user; khách = POST /auth/guest (guest JWT, 2h)
  → App: GET /api/stream/token?channel=<id>  (kèm Authorization: Bearer <JWT>)
       Server: verify JWT → entitlement theo gói (PHÍA SERVER) → ký playback
       token HMAC (TTL 60s, bind user + IP/UA + channel) → trả proxy_url
  → Player (shaka) load proxy_url:
       GET /api/stream/proxy?u=...&t=...  (kèm Authorization + X-CHRTV-Client)
       Server: verify token HMAC + sid + user + scope + re-check gói
       → fetch upstream (inject playback token engine, server-side)
       → rewrite playlist con: mỗi SEGMENT có token MỚI (TTL 60s)
  → Mỗi lần fetch manifest: requestFilter kiểm tra token còn hạn không;
       còn < 25s → tự xin token mới, load lại — KHÔNG gián đoạn.
```

Kênh import từ M3U của user: vẫn phát được (đi qua proxy nếu domain trong
whitelist; domain lạ → phát trực tiếp như cũ, không qua token).

## Phụ lục B — Đổi lại so với trước

| Hạng mục | Trước | Sau |
|---|---|---|
| `stream_url` trong `/api/playlist` | Trả về đầy (kèm token engine) | Chỉ metadata (không URL) |
| Token engine trong m3u | `?token=Ken1402@` ×21 URL | Xoá sạch (0 token) |
| Playback token | 1 token admin chung, vô thời hạn | HMAC TTL 60s, bind user+IP+channel, tự xoay |
| Xác thực stream | Header `X-CHRTV-Client` (giả mạo dễ) | JWT (user/guest) + playback token HMAC |
| Entitlement gói | Chỉ phía client (đổi code là lách) | Phía server (D1 + plan) |
| `/api/proxy` | Open proxy (bất kỳ URL nào) | Whitelist upstream + chặn private IP/SSRF + rate limit |
| `/admin/*` | Bypass bằng secret trong repo | JWT role=admin / `ADMIN_MASTER_TOKEN` + CIDR + audit + alert |
| `/auth/verify` | Brute-force mã được | 5 lần sai → huỷ mã, rate limit email+IP+UA, mã CSPRNG TTL 10 phút |
| Headers bảo mật | Không | HSTS, CSP, XFO, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| CORS | `Access-Control-Allow-Origin: *` | Allowlist origin |
| Guard F12/devtools | "Kill" app khi mở F12 (gây khó debug, dễ bị bypass) | Đã gỡ |
| Embed phim (vidsrc group) | ~50 nguồn không bản quyền | Tắt (trả danh sách rỗng + thông báo) |
| Secret trong code | Hardcode | `wrangler secret` (env) |

## Phụ lục C — Ghi chú pháp lý / vận hành

- **Bản quyền upstream**: các nguồn stream hiện tại cần có giấy phép/phân
  phối hợp lệ. Nếu chưa rõ quyền sử dụng, ưu tiên chuyển sang nguồn có hợp
  đồng; embed API không bản quyền đã tắt trong code.
- **Đổi domain** (tuỳ chọn, prompt ghi là optional): nếu đổi sang domain
  mới — cập nhật `PRODUCTION_API_BASE` trong `src/services/config.js`,
  `CORS_ALLOWED_ORIGINS`, CF Access, và thông báo user (App native cần bản
  build mới).
- **Rotate định kỳ**: playback token engine nên rotate mỗi 30–90 ngày
  (workflow §0.1 + §4). `ADMIN_MASTER_TOKEN` mỗi 6 tháng hoặc khi nghi lộ.
