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

Mở cổng **8788** để vào VEO Studio. Người có quyền truy cập link preview có thể thay đổi dữ liệu mẫu; **không đưa dữ liệu nhạy cảm vào bản thử**. Không dùng preview làm admin production. Chi tiết: [VEO Studio](docs/admin-preview.md).

## Phạm vi hiện có

- Trang `/vod` tìm/lọc VOD mẫu; `/vod/:id` phát HLS/DASH/MP4 fixture. Trong `/admin/vod`, có thể thêm, sửa, xóa, để nháp hoặc hiển thị VOD mẫu. Viewer 8787 và admin 8788 dùng cùng kho D1 local. Chỉ chọn ảnh/video có sẵn, **không upload, không nhập nguồn media thật**; thay đổi tồn tại qua reload/khởi động lại Worker nếu `.wrangler` vẫn còn.
- Sidebar desktop mặc định chỉ biểu tượng, có thể mở/thu; menu và điều hướng riêng cho điện thoại. Có 10 kênh mẫu, chọn/lọc, lịch minh họa, phim, thể thao và Shorts. Giao diện truyền hình lấy cảm hứng cách xem lịch của VTVgo, không dùng tài sản hay tín hiệu VTVgo.
- Yêu thích lưu trên trình duyệt, không đồng bộ tài khoản. Form email chỉ kiểm tra cú pháp; không gửi/lưu email hay xác thực. Các endpoint email và catalog thực trả 503.
- Worker dùng URL cùng origin và danh sách API fixture rõ ràng. D1 binding chỉ nằm trong `wrangler.preview.jsonc`; không có cấu hình production được kết nối. `/admin` và API quản trị chỉ bật với `VEO_ENV=local` + `ADMIN_PREVIEW=enabled` khi chạy local; cờ này **không thay thế xác thực/ủy quyền**.
- Không có dữ liệu, lưu lượng, live, DRM hoặc quyền phát thật. VEO Studio chưa có login/RBAC, audit hay backend production; quản lý kênh chỉ lưu trong phiên tab, khác với kho VOD local.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
# Khi Worker local đã chạy:
npm run test:browser
# Khi Worker 8787 và admin preview 8788 đã chạy:
npm run test:admin-browser
npm run test:vod-browser
npm audit
```

Browser tests chỉ cho phép loopback; kiểm tra một số route, dialog, CRUD fixture, phát video, viewport và mẫu axe. Không chứng minh tuân thủ WCAG toàn diện hay sẵn sàng production. Chromium test giải nén thư viện Linux vào `.cache/`.

## Trước khi phát hành

Không chạy `wrangler deploy` hoặc kết nối hệ thống thật từ cấu hình preview. Cần hoàn tất xác thực email, phân quyền admin phía server, storage/media có bản quyền, cơ sở dữ liệu và API staging, bảo mật, quan sát, kiểm thử, migration và kế hoạch rollout/rollback. Xem [các cổng phát hành](docs/production-gates.md). `veotv.bond`, quyền nội dung và hệ thống tích hợp chưa được xác minh.
