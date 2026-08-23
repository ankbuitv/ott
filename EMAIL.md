# 📧 Cấu hình gửi Email CHRTV qua Brevo

CHRTV dùng **Brevo API v3** (https://api.brevo.com/v3/smtp/email) để gửi email xác minh tài khoản và đặt lại mật khẩu. Hướng dẫn dưới đây lấy từ tài liệu chính thức Brevo.

---

## 🌟 1. Tạo tài khoản Brevo (miễn phí)

Truy cập **https://www.brevo.com** → **Sign up free**.

- Free plan: **300 email/ngày**, đủ cho app nhỏ
- Có logo "Sent with Brevo" ở footer (mất khi upgrade €9/tháng)
- Không giới hạn tính năng transactional/API/templates

---

## 🔑 2. Lấy **API Key** (KHÔNG phải SMTP Key!)

> ⚠️ **QUAN TRỌNG**: Brevo có **2 loại key**, dễ nhầm:
> - **API Key** → dùng cho REST API (POST `/v3/smtp/email`) ✅ **Cái bạn cần**
> - **SMTP Key** → dùng cho SMTP relay (smtp-relay.brevo.com) ❌ Không dùng cho app CHRTV

**Cách lấy API Key:**

1. Đăng nhập Brevo
2. Click avatar góc trên phải → **SMTP & API**
3. Tab **API Keys** → bấm **Generate a new API key**
4. Đặt tên: `CHRTV Worker` → bấm **Generate**
5. **Copy key ngay** (chỉ hiện 1 lần!) — dạng: `xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Verify version: cột **Version** phải là **v3** (v2 không hoạt động).

---

## 📧 3. Verify **Sender Email** (địa chỉ gửi)

Brevo yêu cầu **mọi email gửi đi phải từ address đã verify**.

**Cách verify:**

1. Vào **Settings** → **Senders & IP** → **Senders**
2. Bấm **Add a new sender**
3. Nhập email bạn muốn gửi từ (VD: `noreply@chrtv.app` hoặc `noreply@yourdomain.com`)
4. Brevo gửi email verify → bấm link trong email đó

**Lưu ý domain:**

- Nếu dùng **gmail.com/outlook.com** → **KHÔNG verify được** để gửi (Brevo chặn free email). Phải dùng **domain riêng** (chrtv.app, yourdomain.com…).
- Nếu chưa có domain riêng → mua từ Namecheap/Cloudflare (~50k VND/năm) hoặc dùng subdomain miễn phí kiểu `noreply@chrtv.pages.dev` (Brevo chấp nhận Cloudflare).

---

## ⚙️ 4. Thêm biến môi trường vào Cloudflare Worker

Vào **Cloudflare Dashboard** → **Workers & Pages** → project `chrtv-ott` → **Settings** → **Variables**.

Thêm **3 biến**:

| Tên biến | Giá trị | Ví dụ |
|---|---|---|
| `BREVO_API_KEY` | API key v3 vừa lấy | `xkeysib-xxxxxxxxxx` |
| `BREVO_SENDER_EMAIL` | Sender email đã verify | `noreply@chrtv.app` |
| `BREVO_SENDER_NAME` | Tên người gửi (tùy chọn) | `CHRTV` |

Nhấn **Save and Deploy**.

---

## ✅ 5. Test gửi email

Đăng ký tài khoản mới trên CHRTV bằng email thật của bạn. Trong vòng 30 giây, email xác minh phải đến hộp thư.

**Không nhận được email?** Check:

- **Cloudflare Worker Logs** → tìm dòng `[Brevo] Gửi thất bại: ...` hoặc `[Brevo] Lỗi mạng: ...`
- **Brevo Dashboard** → **Transactional** → **Email** → xem log gửi
- **Spam folder** của email đăng ký

---

## 🛠️ 6. Tùy chọn nâng cao

### Tùy chỉnh HTML template

Code CHRTV đã có 2 template đẹp sẵn trong `worker/worker.js`:
- `emailTemplateVerify(code)` — gradient đỏ, mã 6 số lớn
- `emailTemplateReset(token)` — nút "Đặt lại mật khẩu" + token

Nếu muốn đổi logo, màu sắc, copy → sửa trực tiếp hàm tương ứng trong `worker/worker.js` rồi deploy lại.

### Nâng cấp gói

Free: 300 email/ngày. Nếu vượt:
- Starter (~€25/tháng): 20.000 email/tháng, không logo Brevo
- Essential (~€65/tháng): 150.000 email/tháng

### Tách transactional khỏi marketing

Brevo gộp quota Free giữa transactional + campaigns. Nếu không làm marketing, không lo.

---

## 📞 Hỗ trợ

- Brevo support: https://help.brevo.com/
- Docs API: https://developers.brevo.com/
- CHRTV worker code: `worker/worker.js` (hàm `sendBrevoEmail`)
