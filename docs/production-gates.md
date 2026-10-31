# Cổng phát hành VEO

Tài liệu này là checklist, không phải xác nhận hệ thống đã sẵn sàng. Repo chỉ có **preview**; Workers Builds có thể upload một version chưa nhận traffic theo quyết định của chủ dự án. Trạng thái production hiện hành, quyền sở hữu `veotv.bond`, staging, quyền nội dung và hệ thống upstream đều chưa được xác minh.

## Trước khi triển khai lên môi trường được duyệt

1. **An toàn & quyền truy cập:** xác thực email thật bằng provider được duyệt, quản lý phiên/tokens, RBAC phía server cho từng thao tác admin, CSRF, rate limiting, audit không chứa bí mật, hạn chế nguồn media và security review. Không đưa auth local, endpoint thiết lập admin đầu tiên hay flag preview lên production. PBKDF2 600.000 vòng đã thử ở workerd local nhưng có thể vượt giới hạn Workers thực tế; phải chọn giải pháp auth được review và kiểm thử trên staging. Rà các mục S01–S15 từ tài liệu rà soát nội bộ trước khi bật thật.
2. **Dữ liệu & media:** thiết kế schema, phân tách D1/storage staging và production, migration có backup/rollback và kiểm tra quyền phát. Cần quy trình upload/kiểm duyệt video, poster, captions và DRM nếu có; không lấy URL upstream tùy ý. Dữ liệu VOD local không phải dữ liệu production.
3. **Worker/BFF:** chỉ kết nối upstream được phê duyệt, allowlist rõ ràng, timeout/cancellation, không log token/URL ký/keys, cache server-authoritative, phân tách user/profile. Kiểm tra contract và tránh giả định GET legacy không có side effect.
4. **Chất lượng:** test contract, bảo mật, truy cập, playback trên thiết bị thực, lỗi mạng, deep link, keyboard, reduced motion, subtitle, isolation và quan sát vận hành. Axe smoke test không chứng minh tuân thủ WCAG.
5. **Vận hành:** xác minh domain, tài khoản Cloudflare và trigger GitHub/Workers Builds; lập staging, phê duyệt, rollout, giám sát và rollback rõ ràng. Merge vào `main` có thể kích hoạt automation bên ngoài repository, phải xác nhận trước. Không tự thay secrets, Cloudflare, D1 production hoặc lịch sử Git. Bước build trong cấu hình version từ chối lệnh `wrangler deploy`, nhưng không thể ngăn cấu hình/dashboard hoặc lệnh khác bỏ qua nó; không coi đây là bảo vệ production đầy đủ.

## Chuyển đổi ứng dụng cũ

Thay mã ở đầu nhánh không chuyển tài khoản, dữ liệu, cấu hình hay APK cũ. Workflow build/release Android cũ được loại bỏ vì không còn áp dụng; VEO chưa có APK. Có tệp nhạy cảm trong lịch sử cũ cần chủ sở hữu tự đánh giá và xử lý theo quy trình bảo mật; xóa tệp ở commit mới không xóa lịch sử. Không in, sao chép hoặc đưa các giá trị đó vào VEO.
