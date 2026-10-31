# VEO Studio — quản trị bản xem thử

## Truy cập và thiết lập local

```bash
npm ci
npm run build
npm run worker:dev        # Worker + viewer ở cổng 8787; D1 chỉ local
npm run admin:preview     # chuyển tiếp admin ở cổng 8788, mở /admin
```

Mở `/admin` trên cổng 8788. Khi chưa có admin, nhập email và mật khẩu để **thiết lập admin đầu tiên một lần**. Nếu đã đăng ký tài khoản thường ở `/tai-khoan`, có thể dùng đúng email và mật khẩu đó; phiên cũ của tài khoản được thu hồi khi cấp quyền. Sau lần thiết lập, đăng nhập lại bằng tài khoản admin và không thể tự tạo thêm admin qua trang này.

**Rủi ro được chọn cho preview:** trước khi thiết lập xong, bất kỳ ai có link đều có thể giành quyền admin đầu tiên. Hãy thực hiện ngay và dùng thông tin riêng cho bản thử. Nếu thấy trang đăng nhập khi bạn chưa từng thiết lập admin, đừng nhập mật khẩu; hãy dừng và kiểm tra. Không gửi mật khẩu qua chat, không dùng mật khẩu thật. Không có quên/khôi phục mật khẩu trong bản thử.

Email là tên đăng nhập chưa được xác minh: không gửi email hay mã xác nhận. Tài khoản, mật khẩu đã băm, phiên và VOD chỉ nằm trong D1 local `.wrangler/`, có thể mất khi môi trường bị xóa. Không đưa thông tin cá nhân, bí mật hay dữ liệu production vào preview. Hai cổng/hostname có thể dùng cookie khác nhau; bạn có thể cần đăng nhập lại ở viewer và admin.

Cổng 8788 chuyển tiếp tới Worker local qua loopback; POST/PUT/DELETE chỉ dành cho các route auth và CRUD VOD mẫu cụ thể. Các tác vụ ghi yêu cầu header preview và cùng origin; khi Wrangler viết lại scheme của Arena preview, Worker cũng kiểm tra Fetch Metadata same-origin. Đây chỉ là phòng vệ preview, không phải biện pháp production. Browser luôn gọi URL cùng origin.

## Có thể thử

- `/tai-khoan`: đăng ký user thường, đăng nhập và đăng xuất local. Đăng ký công khai không thể tự chọn vai trò admin.
- `/admin/vod`: sau khi đăng nhập admin, thêm/sửa/xóa VOD, chọn bản nháp hoặc hiển thị. API quản trị VOD kiểm tra phiên và vai trò trên Worker; user thường và khách bị từ chối. `/vod` chỉ trả nội dung đã hiển thị. Poster, HLS/DASH/MP4 là fixture, không phải upload hay URL thật.
- D1 local dùng chung cho admin và viewer; thay đổi còn sau reload/restart nếu `.wrangler/` còn tồn tại. Init lặp lại không khôi phục các fixture đã xóa.
- Kênh thêm/sửa/xóa/khôi phục chỉ trong `sessionStorage` của tab hiện tại, không đồng bộ viewer hay Worker. Nhật ký giao diện không phải audit server.

## Giới hạn bảo mật

**Không phải auth production.** Local dùng mật khẩu băm PBKDF2 kèm salt riêng, cookie phiên HttpOnly/SameSite và kiểm tra vai trò cho API VOD mẫu. Khóa tạm theo số lần đăng nhập sai chỉ theo email; chưa có rate limit toàn diện, audit, khôi phục mật khẩu, xác minh email, MFA, cơ chế chống chiếm admin đầu tiên hoặc security review. PBKDF2 600.000 vòng đã thử ở workerd local, **không giả định chạy được trong Workers production**. Các biện pháp local và cờ preview không đủ để bảo vệ dịch vụ công khai.

Worker version Cloudflare vẫn vô hiệu tài khoản, admin và API quản trị; không có D1. Trước khi dùng thật cần auth/RBAC được thiết kế và review riêng, tách staging, rate limits, audit, media/licensing, contract tests và rollout. Không deploy cấu hình local hoặc nối CHRTV/D1 production.

## Kiểm thử

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:admin-browser
npm run test:vod-browser
npm run test:auth-browser
npm audit
```

Browser suite tự khởi tạo Worker và D1 tạm, không đụng D1 của bạn và không chiếm chỗ admin. Kiểm thử không chứng minh toàn bộ WCAG hoặc độ sẵn sàng production.
