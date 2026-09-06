# 🔐 Nhập ĐÚNG mật khẩu vẫn báo SAI — nguyên nhân & cách xử lý

Tài liệu này giải thích **tại sao đăng nhập hỏng** sau đợt vá bảo mật
(`SECURITY_FIX_RUNBOOK.md`) và cách khôi phục tài khoản.

---

## 1. Nguyên nhân chính: xoay `JWT_SECRET` = xoá sạch mật khẩu của user

Code cũ:

```js
password_hash = sha256(password + JWT_SECRET)   // ❌ mật khẩu bị buộc vào JWT_SECRET
```

Runbook bảo (đúng) là phải `wrangler secret put JWT_SECRET` bằng giá trị mới vì secret cũ
đã lộ. Nhưng vì hash mật khẩu trộn thẳng `JWT_SECRET`, **đổi secret = mọi
`password_hash` trong D1 thành rác** → user gõ đúng mật khẩu, server tính ra hash khác
→ trả về:

```json
{"error":"Sai mật khẩu — thử lại hoặc bấm Quên mật khẩu.","code":"WRONG_PASSWORD"}
```

Đã tái hiện y hệt trên Worker local (đổi `JWT_SECRET` → login đúng mật khẩu vẫn 401).

### Đã sửa trong code

| Trước | Sau |
| --- | --- |
| `hashPassword()` dùng `JWT_SECRET` | dùng `PASSWORD_PEPPER` (chưa set thì rơi về `JWT_SECRET`) |
| Chữ ký JWT dùng chung hàm hash mật khẩu | tách riêng `signToken()` dùng `JWT_SECRET` |
| Chỉ fallback được `sha256(password)` đời đầu | `verifyPassword()` thử: pepper hiện tại → mọi secret CŨ khai báo trong `LEGACY_PASSWORD_PEPPERS` / `LEGACY_JWT_SECRETS` → `sha256(password)` |
| — | Khớp bằng lược đồ cũ ⇒ **tự ghi lại hash chuẩn mới** (user không phải làm gì) |
| So sánh hash bằng `===` | so sánh hằng thời gian (`safeEqual`) |

Từ nay **xoay `JWT_SECRET` chỉ thu hồi phiên đăng nhập, KHÔNG khoá mật khẩu**.

---

## 2. Khôi phục tài khoản đang bị khoá NGAY

### Cách A — còn nhớ `JWT_SECRET` cũ (nhanh nhất, không ai phải đổi mật khẩu)

```bash
cd ott
npx wrangler secret put LEGACY_JWT_SECRETS
# dán secret CŨ. Nhiều secret cũ thì ngăn cách bằng dấu phẩy:
#   secret_cu_1,secret_cu_2
npx wrangler deploy
```

User đăng nhập lại như bình thường; lần đăng nhập đầu tiên hash được nâng cấp sang
chuẩn mới. Sau 2–4 tuần (khi đa số user đã login lại) thì xoá:
`npx wrangler secret delete LEGACY_JWT_SECRETS`.

### Cách B — KHÔNG còn secret cũ ⇒ phải đặt lại mật khẩu

**B1. Admin đặt lại hộ (có `ADMIN_MASTER_TOKEN`)**

```bash
curl -s -X POST https://play.ankb.qzz.io/admin/users/action \
  -H "Authorization: Bearer $ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "action": "reset_password"}'
# -> {"success":true,"tempPassword":"chrtv-xxxxxxxx"}  (đưa cho user, bảo họ đổi lại)
```

**B2. Người dùng tự bấm “Quên mật khẩu”** — cần `BREVO_API_KEY` đã cấu hình để gửi email.

**B3. Ghi thẳng hash vào D1** (dùng cho tài khoản admin gốc khi mất hết đường trên):

```bash
# 1) Tính hash = sha256(matkhau + PASSWORD_PEPPER hiện tại)
node -e "const c=require('crypto');console.log(c.createHash('sha256').update(process.argv[1]+process.argv[2],'utf8').digest('hex'))" \
  'MatKhauMoi123' 'GIA_TRI_PASSWORD_PEPPER'

# 2) Ghi vào D1 production
npx wrangler d1 execute chrtv-db --remote \
  --command "UPDATE users SET password_hash='<hash_vừa_tính>' WHERE email='admin@ankb.qzz.io'"
```

> Nếu chưa set `PASSWORD_PEPPER` thì dùng giá trị `JWT_SECRET` hiện tại thay vào.

### Khuyến nghị cấu hình chuẩn (làm 1 lần)

```bash
npx wrangler secret put PASSWORD_PEPPER      # chuỗi ngẫu nhiên riêng cho mật khẩu, KHÔNG bao giờ xoay
npx wrangler secret put JWT_SECRET           # thoải mái xoay khi cần thu hồi phiên
```

Bật `PASSWORD_PEPPER` lần đầu **không làm ai mất mật khẩu**: `JWT_SECRET` hiện tại tự
động được thử như một pepper cũ và hash được nâng cấp ngay lần login kế tiếp
(đã test).

---

## 3. Các nguyên nhân khác cũng đã vá trong lần này

| Triệu chứng | Nguyên nhân | Đã sửa |
| --- | --- | --- |
| “Đăng nhập sai quá nhiều lần. Tạm khoá 15 phút” dù mình mới thử 1 lần | Khoá đếm chung `login OR ip` ngưỡng 5 → nhà mạng VN dùng CGNAT, người khác gõ sai là mình bị khoá lây | Tách ngưỡng: **5 lần/tài khoản**, **20 lần/IP** |
| “Quá nhiều request — thử lại sau” khi bấm Đăng nhập | Màn hình QR poll `/auth/qr/poll` mỗi 2s = 30 req/phút, vượt trần `/auth/*` 20 req/phút của chính IP mình | Poll 3s + trần riêng cho poll (120/phút), `/auth/*` khác 40/phút |
| DB mới: “Lỗi đăng ký … no such table: users”, đăng nhập báo “Tài khoản không tồn tại” | `CREATE INDEX idx_shorts_creator ON shorts(creator_id)` nằm trong batch schema nhưng cột `creator_id` chỉ được thêm ở bước ALTER sau đó → **cả batch rollback ⇒ không có bảng nào được tạo** | Chuyển index xuống sau ALTER + nếu batch lỗi thì chạy lại từng câu |
| Đổi mật khẩu báo “Sai mật khẩu cũ” dù gõ đúng | `/user/change-password` so hash trực tiếp trong SQL nên dính đúng lỗi §1 | Dùng `verifyPassword()` |
| PIN profile trẻ em báo sai | Cùng lý do | Dùng `verifyPassword()` + tự nâng cấp hash |
| “Tài khoản chưa xác minh email” | Đúng thiết kế: bắt buộc verify email. Chưa cấu hình `BREVO_API_KEY` thì mã hiện ngay trên màn hình (`devCode`) | Không đổi |

---

## 4. Tự kiểm tra nhanh

```bash
# Server production
BASE=https://play.ankb.qzz.io
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"TEN_HOAC_EMAIL","password":"MAT_KHAU"}' | head -c 300
```

Đọc `code` trong JSON:

| `code` | Ý nghĩa | Xử lý |
| --- | --- | --- |
| `NO_ACCOUNT` | sai tên đăng nhập/email | kiểm tra lại (đã hỗ trợ không phân biệt hoa thường) |
| `WRONG_PASSWORD` | hash không khớp | nếu chắc chắn gõ đúng ⇒ đúng lỗi §1, làm theo §2 |
| `RATE_LIMITED` | đang bị khoá tạm | chờ 15 phút hoặc `DELETE FROM login_attempts WHERE login='...'` |
| `EMAIL_NOT_VERIFIED` | chưa xác minh email | bấm “Gửi lại mã” |
| `TOTP_REQUIRED` / `TOTP_INVALID` | đang bật 2FA | nhập mã Authenticator; admin có thể `disable_2fa` |
| `BANNED` | admin đã khoá | `unban` trong Admin Panel |

Chạy bộ test đăng nhập tự động trên Worker local:

```bash
npm run dev:api                       # terminal 1
bash scripts/auth-selftest.sh         # terminal 2 (mặc định http://127.0.0.1:8787)
```
