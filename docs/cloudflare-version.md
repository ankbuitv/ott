# Worker version VEO — bản thử chỉ đọc

Chủ dự án đã cho phép Workers Builds upload **một Worker version chưa được phân phối traffic** lên Worker `chrtv-ott`. Đây không phải phê duyệt merge, promote hay deploy production. `wrangler versions upload` tạo version, còn việc phân phối traffic là bước riêng; Version URL không phải môi trường staging cách ly.

## Cách build hoạt động

- `wrangler.jsonc` ở root chỉ vào `worker/version-entry.ts` và static assets `dist/`, tên khớp Worker đang được kết nối với GitHub. Custom build chạy `npm run build` trước khi upload, nên không phụ thuộc vào cache `dist` hoặc cấu hình build command trong dashboard.
- `scripts/cloudflare-version-build.mjs` từ chối các Wrangler command khác ngoài `versions upload`. Đây chỉ là một biện pháp phòng vệ cho cấu hình mặc định; dashboard hoặc lệnh khác có thể bỏ qua nó. Không merge/deploy nếu chưa review và phê duyệt production riêng.
- `keep_vars: true` yêu cầu Wrangler giữ biến được cấu hình trên dashboard trong version. Cloudflare có thể kế thừa secrets từ version trước; không sao chép, in, thiết lập hoặc thay đổi giá trị bí mật trong repo. `version-entry.ts` **chỉ đọc `ASSETS`**, bỏ qua tất cả biến, secrets và binding khác; không cấu hình D1, R2, KV, routes hoặc domains trong version này.
- Endpoint `/api/demo/vod` trong version trả danh mục fixture **chỉ đọc** được đóng gói cùng code; video/poster chỉ từ assets local. Deep link `/vod/:id` hoạt động với fixture. `/admin` và API admin trả 404 ngay cả khi Worker cũ có biến preview trùng tên. Danh mục và chỉnh sửa VOD ở local không đồng bộ vào version.
- Quyền media, D1 production, đăng nhập email, auth/RBAC, audit, migration và dữ liệu thật chưa có. Không promote version này thành dịch vụ production.

## Kiểm thử không upload

```bash
npm ci
# Không cần chạy npm run build trước: Wrangler tự gọi custom build.
npx wrangler versions upload --dry-run
npm run test:version-runtime
```

`--dry-run` chỉ biên dịch và kiểm tra, không upload. Dùng `npm run worker:dev` cho bản local và cấu hình `wrangler.preview.jsonc` riêng. Không dùng lệnh `wrangler deploy`; chủ dự án phải kiểm tra trạng thái Cloudflare và phê duyệt một cấu hình phát hành an toàn trước mọi release thực.
