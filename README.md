# VEO

VEO là giao diện OTT tiếng Việt của AnkWorks. Repository này chứa **bản xem thử**, chưa phải dịch vụ production. Kênh, lịch, phim, ảnh và video là dữ liệu minh họa; không đại diện tín hiệu thật, giấy phép phát sóng hay danh mục thương mại. Logo dùng ảnh do người dùng cung cấp, chỉ crop khoảng trống.

## Chạy bản xem thử

Yêu cầu Node.js 22 và npm. Không cần secrets hay tài nguyên Cloudflare thật.

```bash
npm ci
npm run build
npm run worker:dev
```

Mở trang xem ở cổng **8787**. `worker:dev` chỉ khởi tạo D1 **local** không phá dữ liệu đã có rồi chạy `wrangler dev --local`; không thực thi migration production. Dữ liệu VOD thử lưu trong `.wrangler/` trên máy đang chạy Worker (không theo Git, có thể mất khi môi trường bị xóa). Sau khi build lại, khởi động lại Worker để cập nhật asset manifest. `npm run dev` chỉ chạy Vite giao diện, không có Worker API.

Trong terminal khác, sau khi Worker 8787 đã sẵn sàng:

```bash
npm run admin:preview
```

Mở cổng **8788** và vào `/admin` để thiết lập admin đầu tiên. **Cho đến khi bạn thiết lập xong, bất kỳ ai có link preview có thể tạo admin trước bạn.** Hãy thực hiện ngay, dùng mật khẩu riêng cho bản thử và không đưa dữ liệu nhạy cảm vào đây. Những lần sau dùng email và mật khẩu đó để đăng nhập. Nếu trang báo admin đã được thiết lập mà bạn chưa làm, dừng lại và kiểm tra trước khi nhập mật khẩu. Chi tiết: [VEO Studio](docs/admin-preview.md).

## Phạm vi hiện có

- Trang `/vod` tìm/lọc VOD mẫu; `/vod/:id` phát HLS/DASH/MP4 fixture. Trong `/admin/vod`, có thể thêm, sửa, xóa, để nháp hoặc hiển thị VOD mẫu. Viewer 8787 và admin 8788 dùng cùng kho D1 local. Chỉ chọn ảnh/video có sẵn, **không upload, không nhập nguồn media thật**; thay đổi tồn tại qua reload/khởi động lại Worker nếu `.wrangler` vẫn còn.
- Sidebar desktop mặc định chỉ biểu tượng, có thể mở/thu; menu và điều hướng riêng cho điện thoại. Có 10 kênh mẫu, chọn/lọc, lịch minh họa, phim, thể thao và Shorts. Giao diện truyền hình lấy cảm hứng cách xem lịch của VTVgo, không dùng tài sản hay tín hiệu VTVgo.
- `/tai-khoan` cho đăng ký/đăng nhập bằng email và mật khẩu **chỉ trong local**. Không gửi email, không xác minh địa chỉ và không có khôi phục mật khẩu. Dùng địa chỉ và mật khẩu riêng để thử; tài khoản lưu trong D1 local có thể mất. Yêu thích vẫn lưu trên trình duyệt, không đồng bộ tài khoản. Các endpoint email thật và catalog thực trả 503.
- Worker dùng URL cùng origin và D1 binding chỉ nằm trong `wrangler.preview.jsonc`. Trong bản local, API quản trị VOD yêu cầu phiên admin; `/admin` hiển thị trang đăng nhập/thiết lập. Cờ preview không phải ranh giới bảo vệ production. Version Cloudflare chỉ đọc, không có D1, đăng ký, đăng nhập hoặc admin.
- Không có dữ liệu, lưu lượng, live, DRM hoặc quyền phát thật. VEO Studio chưa có auth/RBAC production hay audit; quản lý kênh chỉ lưu trong phiên tab, khác với kho VOD local. Phiên trình duyệt 8787 và 8788 có thể độc lập theo hostname; nếu cần, đăng nhập lại ở mỗi trang.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
npm run test:version-runtime
# Mỗi browser suite tự khởi chạy D1 local tách biệt, không chiếm admin của bạn:
npm run test:browser
npm run test:admin-browser
npm run test:vod-browser
npm run test:auth-browser
npm audit
```

Browser tests chỉ cho phép loopback, tự dùng cơ sở dữ liệu tạm trong `.cache/`; kiểm tra một số route, dialog, CRUD fixture, phát video, viewport và mẫu axe. Không chứng minh tuân thủ WCAG toàn diện hay sẵn sàng production. Chromium test giải nén thư viện Linux vào `.cache/`.

## Trước khi phát hành

Không chạy `wrangler deploy` hoặc kết nối tài nguyên production từ cấu hình preview. Chủ dự án đã chấp thuận một **version chưa nhận traffic** trên Worker hiện có để kiểm tra build; xem [giới hạn Worker version](docs/cloudflare-version.md). Cần hoàn tất xác thực email, phân quyền admin phía server, storage/media có bản quyền, cơ sở dữ liệu và API staging, bảo mật, quan sát, kiểm thử, migration và kế hoạch rollout/rollback. Xem [các cổng phát hành](docs/production-gates.md). `veotv.bond`, quyền nội dung và hệ thống tích hợp chưa được xác minh.
