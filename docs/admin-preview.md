# VEO Studio — quản trị bản xem thử

## Truy cập local

```bash
npm ci
npm run build
npm run worker:dev       # Worker + viewer ở cổng 8787; D1 chỉ local
npm run admin:preview    # chuyển tiếp admin ở cổng 8788, mở /admin
```

Cổng 8788 chuyển tiếp tới Worker local cố định, không nhận upstream tùy ý. GET/HEAD được chuyển tiếp; POST/PUT/DELETE chỉ dành cho các route CRUD VOD mẫu cụ thể. Tác vụ ghi yêu cầu header preview và cùng origin (Origin hợp lệ hoặc Fetch Metadata same-origin khi trình duyệt ẩn Origin vì `no-referrer`); các kiểm tra này **không phải xác thực**. Browser luôn gọi URL cùng origin.

## Có thể thử

- `/admin/vod`: thêm, sửa, xóa VOD; chọn trạng thái bản nháp hoặc hiển thị. Danh mục công khai `/vod` và chi tiết `/vod/:id` chỉ trả nội dung đã hiển thị. Poster và HLS/DASH/MP4 đều là fixture được đóng gói, không phải upload hay URL media tùy ý.
- Admin 8788 và viewer 8787 dùng chung D1 local của Worker. Thay đổi còn sau reload hoặc restart Worker khi thư mục `.wrangler/` còn tồn tại. Khởi tạo lặp lại không khôi phục các fixture đã xóa. Dữ liệu local có thể mất khi workspace bị xóa/khôi phục; không đưa thông tin nhạy cảm, token hay stream thật vào đây.
- Danh sách kênh thêm/sửa/xóa/khôi phục trong `sessionStorage` của tab hiện tại; nếu bị chặn thì chỉ ở bộ nhớ. Chức năng này không đồng bộ viewer hoặc Worker. Hai cổng là hai origin khác nhau, nên phiên kênh độc lập.
- Tổng quan chỉ tính fixture; kho phim/Shorts chỉ đọc, lịch mẫu và tài khoản/email chưa kết nối. Nhật ký giao diện chỉ phản ánh thao tác phiên kênh, **không phải audit server**.

## Giới hạn bảo mật

**Không phải admin production.** Không có đăng nhập, phân quyền, audit server, media thực, EPG hay email. Người có link preview có thể chỉnh dữ liệu mẫu. `/admin` và API quản trị mặc định trả 404 nếu không có cả hai cờ local preview; cờ không bảo vệ khi bị bật công khai. Payload VOD được giới hạn kích thước, validate, SQL parameterized, API không cache và media bị giới hạn vào fixture; đây chỉ là phòng vệ của bản thử, không phải đánh giá bảo mật production.

Trước khi dùng thật cần auth/RBAC phía server, phân tách môi trường/dữ liệu, rate limits, audit, kiểm tra upload/nội dung/quyền phát, contract tests và security review. Không deploy bản preview hoặc nối CHRTV/D1 production.

## Kiểm thử

```bash
npm run typecheck
npm test
npm run test:browser          # Worker local 8787
npm run test:admin-browser    # Worker 8787 + admin 8788
npm run test:vod-browser      # CRUD mẫu qua 8788, xem/phát qua 8787
npm audit
```

Kiểm thử tự động không chứng minh toàn bộ WCAG hoặc độ sẵn sàng production.
