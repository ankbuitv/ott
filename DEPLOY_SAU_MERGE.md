# 🚀 Sau khi merge PR #14 — làm gì trên Cloudflare

Làm **đúng thứ tự** dưới đây. Tổng thời gian ~15 phút. Mọi lệnh chạy ở thư mục repo,
đã `npx wrangler login` (hoặc set `CLOUDFLARE_API_TOKEN`).

> ⚠️ Đọc mục **0** trước khi bấm merge — có 2 thứ nếu bỏ qua là app **mất kênh** hoặc
> **APK cũ không phát được**.

---

## 0. Hai cảnh báo phá đám (đọc trước)

| Rủi ro | Vì sao | Cách xử lý |
|---|---|---|
| **APK/web bản CŨ sẽ không phát được** | Bản cũ đọc `stream_url` từ `/api/playlist`; bản mới không trả field đó nữa | Deploy web trước (web tự cập nhật ngay), rồi build APK mới (mục 6). Ai còn APK cũ: bật tạm `PUBLIC_STREAM_URL=1` (mục 7) cho tới khi họ cập nhật |
| **Tất cả user bị đăng xuất 1 lần** | `getAuth()` giờ đối chiếu bảng `sessions`; JWT cũ không có row → 401 | Bình thường, chỉ cần đăng nhập lại. Báo trước trong app/nhóm chat để khỏi bị hỏi |

---

## 1. Merge + deploy

```bash
gh pr merge 14 --squash --delete-branch=false     # hoặc bấm Merge trên GitHub
git checkout main && git pull
```

Deploy Worker + frontend (wrangler tự chạy `npm run build` nhờ `[build]` trong `wrangler.toml`):

```bash
npx wrangler deploy
```

> Nếu dự án đang bật **Workers Builds** (Cloudflare tự deploy khi push `main`) thì
> bỏ qua lệnh trên, chỉ cần theo dõi build trong Dashboard → Workers & Pages → `chrtv-ott` → Deployments.

---

## 2. Set secret (chỉ cần làm 1 lần)

```bash
# --- Bắt buộc, đã có từ trước, KHÔNG cần đụng lại ---
# JWT_SECRET, STREAM_TOKEN_SECRET, PASSWORD_PEPPER, ADMIN_MASTER_TOKEN

# --- MỚI ở PR này ---
npx wrangler secret put M3U_SOURCE_URL       # nguồn playlist riêng tư — xem mục 3
npx wrangler secret put STREAM_MANIFEST_TTL  # tuỳ chọn, mặc định 300 (giây, cho phép 60..1800)
npx wrangler secret put PROXY_ALLOWED_HOSTS  # tuỳ chọn: "fptplay53.net,seenow.vn,vtv.sub.id"
```

**KHÔNG set `PUBLIC_STREAM_URL`** — đó là công tắc khẩn cấp, để trống nghĩa là bảo vệ đang bật.

Kiểm tra danh sách secret hiện có: `npx wrangler secret list`

---

## 3. Bịt nốt lỗ cuối: playlist trên GitHub public

Worker vẫn nạp kênh từ `https://raw.githubusercontent.com/ankbuitv/ott/.../playlists/tv.m3u`.
**Repo còn public thì ai cũng tải được file này** — vá trong app xong mà quên chỗ này là công cốc.

Chọn 1 trong 3, làm theo thứ tự an toàn:

**Cách A — R2 (khuyến nghị, miễn phí):**
```bash
npx wrangler r2 bucket create chrtv-private
npx wrangler r2 object put chrtv-private/tv.m3u --file playlists/tv.m3u
# Bật Public Development URL cho bucket rồi lấy link, hoặc dùng custom domain có Access rule
npx wrangler secret put M3U_SOURCE_URL   # dán link vừa lấy
```

**Cách B — Gist bí mật / repo private khác:** dán raw URL (có token nếu private) vào `M3U_SOURCE_URL`.

**Cách C — chuyển repo `ankbuitv/ott` sang private.**
> ⚠️ Làm cách C **sau khi** `M3U_SOURCE_URL` đã trỏ chỗ khác và verify OK. Chuyển private
> mà quên bước này thì raw URL cũ trả 404 → Worker rơi về `DEFAULT_CHANNELS` (chỉ vài kênh).

Sau khi đổi nguồn, ép nạp lại kênh:
```bash
curl -s "https://play.ankb.qzz.io/api/playlist?refresh=1" | head -c 300
```

---

## 4. Verify production (copy–paste, 30 giây)

```bash
# 1) Playlist KHÔNG còn link gốc  -> phải in ra 0
curl -s https://play.ankb.qzz.io/api/playlist | grep -c stream_url

# 2) File m3u static bị chặn      -> phải là 404
curl -s -o /dev/null -w '%{http_code}\n' https://play.ankb.qzz.io/playlists/tv.m3u
curl -s -o /dev/null -w '%{http_code}\n' https://play.ankb.qzz.io/tv.m3u

# 3) Bộ test đầy đủ               -> 38 passed / 0 failed
BASE=https://play.ankb.qzz.io bash scripts/acceptance-test.sh
BASE=https://play.ankb.qzz.io bash scripts/auth-selftest.sh
```

Rồi thử tay 3 việc trên web `https://play.ankb.qzz.io`:
1. Đăng nhập → mở 1 kênh → **F12 → Network**: chỉ thấy `/api/stream/proxy?t=…`, không thấy domain gốc.
2. Copy link proxy đó dán sang VLC → phải **lỗi/403**.
3. Cài đặt → **Đổi mật khẩu**, tick “đăng xuất thiết bị khác” → thiết bị kia bị đá ra thật.

---

## 5. Theo dõi 24 giờ đầu

```bash
npx wrangler tail --format pretty            # xem log trực tiếp
npx wrangler tail --search TOKEN_SID_MISMATCH  # dấu hiệu player bị đá oan
```

Cần để mắt:
- `TOKEN_SID_MISMATCH` rải rác = bình thường (người ta copy link). **Dồn dập từ 1 user** = player native của họ đổi User-Agent giữa chừng → báo mình nới rule.
- `stream_token_flood` = 1 phiên xin quá 240 token/5 phút → khả năng đang bị rip.
- `stream_tool_blocked` = curl/VLC/ffmpeg bị chặn (đúng ý đồ).
- Trong Admin → Analytics: tỉ lệ lỗi phát có tăng bất thường không.

---

## 6. Build lại APK Android

Web tự cập nhật, **app cài sẵn thì không** — bắt buộc phát hành bản mới:

```bash
gh workflow run build-android.yml         # rồi tải APK ở tab Actions → Artifacts
```

Gửi APK mới cho user (hoặc bản cập nhật trên kênh phân phối của bro) **trước khi** tắt kill-switch ở mục 7.

---

## 7. Nếu có sự cố — cứu trong 30 giây

| Tình huống | Lệnh |
|---|---|
| Kênh không phát được hàng loạt | `npx wrangler secret put PUBLIC_STREAM_URL` → nhập `1` (app quay lại dùng link gốc, mất bảo vệ). Sửa xong nhớ: `npx wrangler secret delete PUBLIC_STREAM_URL` |
| Player hay đứt giữa chừng | Tăng TTL: `npx wrangler secret put STREAM_MANIFEST_TTL` → `600` |
| Deploy hỏng nặng | `npx wrangler rollback` (hoặc Dashboard → Deployments → Rollback bản trước) |
| Proxy trả 502 với 1 kênh | Host gốc chưa nằm trong whitelist → thêm vào `PROXY_ALLOWED_HOSTS` |

---

## 8. Checklist ngắn để tick

- [ ] Merge PR #14, `wrangler deploy` xong
- [ ] `M3U_SOURCE_URL` trỏ nguồn riêng tư, `/api/playlist?refresh=1` vẫn đủ 155 kênh
- [ ] `grep -c stream_url` = 0 · `/playlists/tv.m3u` = 404
- [ ] acceptance-test 38/38 trên production
- [ ] Xem thử 1 kênh trên web + 1 kênh trên TV/điện thoại
- [ ] Đổi mật khẩu chạy đúng, thiết bị khác bị đá
- [ ] APK mới đã build và phát hành
- [ ] `PUBLIC_STREAM_URL` **không** tồn tại trong `wrangler secret list`
- [ ] (sau cùng) repo chuyển private hoặc gỡ `playlists/tv.m3u`
