# 🛡️ CHỐNG CRASH — vì sao app "nhiều lúc" trắng/treo, và đã sửa gì

Tài liệu này trả lời câu "sao nhiều lúc nó cứ bị crash v?". Có **4 loại** khác nhau,
đừng chữa nhầm. Tất cả đã được xử lý ở bản hiện tại; phần cuối là cách đọc lỗi thật.

---

## 0. Tóm tắt thay đổi

| # | Bệnh | Nguyên nhân gốc | Đã sửa |
|---|---|---|---|
| ① | App trắng màn hình / mất sạch danh sách kênh khi Worker chậm hoặc 5xx | `fetchChannels()` **không timeout**, **không cache** danh sách tốt cuối, và khi fail thì rớt về **1 kênh dự phòng** `http://bore.pub` (link hầm tạm, lại là http nên bị chặn trên nền https) | `src/services/api.js`: timeout 12s + cache `localStorage[chrtv_channels_v1]` + chỉ dùng kênh dự phòng khi cả 2 lớp đều trắng |
| ② | API lỗi *giữa đợt import*: `data: []`, 500, tự nhân đôi tải | `writeChannels()` chạy `DELETE FROM channels` **trước** rồi mới INSERT từng batch 50 hàng → chết giữa chừng là bảng **rỗng/cụt**; và mọi request thấy bảng trống lại đi import tiếp (**không có khoá**) | `worker/worker.js`: bỏ truncate — upsert trước, hàng cũ mới bị hạ `is_active=0`; thêm `importChannelsOnce()` gộp mọi request lạnh vào **một** lần import |
| ③ | Chậm dây chuyền rồi fail sau một lần D1 lỗi | `ensureSchema()` chỉ bật cờ `schemaReady` khi **thành công**; thất bại 1 lần → **mọi** request sau chạy lại ~130 câu SQL | `worker/worker.js:1105` — backoff 30s (`schemaFailedAt`) |
| ④ | Người dùng thấy màn "⚠️ Có lỗi bất ngờ xảy ra" rồi tải lại, **mất dấu** | Lỗi React chỉ nằm ở console của máy người dùng | `src/services/clientErrors.js` + `ErrorBoundary` + `main.jsx`: gửi về `POST /api/telemetry/player` → bảng `player_errors` → **Admin → tab “Lỗi player”** (badge `APP` + dòng message), và lưu 3 lỗi gần nhất vào `sessionStorage` để đọc sau khi reload |

Không đổi gì về nghiệp vụ: luật gói, token, watermark giữ nguyên.

---

## 1. Loại ① — “trắng app” (phổ biến nhất, và KHÔNG phải lỗi React)

`src/services/api.js` là nơi duy nhất nạp danh sách kênh. Trước đây:

```js
const res = await fetch(`${BASE}/api/playlist`, {...});      // ← không timeout
if (json.data.length > 0) return json.data;                  // ← rỗng = rơi xuống dưới
return [{ channel_id: "FALLBACK_LIVE", stream_url: "http://bore.pub:30113/…" }];
```

Ba lỗi cộng lại thành cảm giác "crash lúc có lúc không":

- **Không timeout** ⇒ Worker đang import lại M3U (lạnh D1) có thể mất hàng chục giây;
  app ngồi chờ vô hạn ⇒ *treo*, không phải *lỗi*.
- **Không có dữ liệu dự phòng** ⇒ một cú 500/522 là mất **155 kênh**, thay vì dùng
  danh sách lần cuối thành công.
- **Kênh dự phòng chết sẵn** ⇒ `bore.pub` là hầm tạm và là `http://` (mixed content bị
  trình duyệt chặn trên nền https). Nó chỉ làm người dùng tưởng app hỏng hẳn.

Bây giờ: timeout 12s → cache `chrtv_channels_v1` (`{t, n, data}`, chặn ghi > 1.5 MB,
JSON hỏng thì im lặng bỏ qua) → mới đến kênh dự phòng. **Cache chỉ bị ghi khi playlist
không rỗng**, nên một đợt `data: []` từ server không xoá sạch được dữ liệu tốt.

Test: `node scripts/crash-guard-check.mjs` (19 check: fetchChannels + clientErrors, chạy bằng jsdom, không cần trình duyệt).

## 2. Loại ② — Worker tự giết mình lúc lạnh (Free plan)

`wrangler.toml:18-24` đã ghi rõ tài khoản đang ở **Workers Free** (vì 5 cron trigger/account),
nghĩa là: 100.000 request/ngày (hết → Error 1027, **sập cả site tới 00:00 UTC**),
10ms CPU/request, 50 subrequest/invocation, 128MB/isolate. D1 free ~100k hàng ghi/ngày.

Ghép với code cũ thì ra đúng triệu chứng "nhiều lúc":

```
request A: SELECT channels → 0 hàng → fetch M3U → DELETE FROM channels → batch 1/4 OK
request B: SELECT channels → 0 hàng → fetch M3U → DELETE FROM channels → batch 1/4 ...
request A: batch 2/4 → Worker bị cắt (hết CPU / hết subrequest / D1 5xx)
KẾT QUẢ : bảng channels rỗng hoặc cụt → /api/playlist trả [] → xem mục ①
```

Đã sửa:
- `writeChannels` **không còn xoá trước khi ghi**: `INSERT OR REPLACE` từng batch, sau đó
  `UPDATE channels SET is_active = 0 WHERE created_at < <mốc bắt đầu>` cho những kênh đã bị
  gỡ khỏi M3U (`INSERT OR REPLACE` luôn đặt `created_at` = lúc chạy, nên phép so sánh này đúng;
  mốc trừ 2 phút làm dung sai lệch đồng hồ). Bảng **không bao giờ** có khoảnh khắc rỗng.
  Rác ẩn quá 30 ngày mới bị xoá hẳn.
  Nếu DB quá cũ (không có cột `is_active`) thì giữ đường legacy `DELETE`+INSERT như cũ.
- `importChannelsOnce(env)` gộp mọi request đồng thời trong cùng isolate vào **một** lần
  fetch M3U + một lần ghi D1 (callers: `handlePlaylist`, `handleChannels`, cron).
- Ba đường SELECT đọc kênh đều đã lọc `is_active = 1` từ trước nên không phải đổi gì.

## 3. Loại ③ — schema retry bão

`ensureSchema()` chạy ~109 câu `CREATE …` + các `ALTER TABLE` migration. Có cờ
`schemaReady` per-isolate, nhưng khi fail thì fail **mãi mãi** (mọi request thử lại).
Giờ: thất bại → `schemaFailedAt`, 30s tiếp theo trả lời "chưa ready" ngay, không đập
vào D1 nữa; thành công thì reset cờ. (64 chỗ gọi `ensureSchema` đều `await` mà không
nghiệm giá trị trả về, hành vi khi D1 thực sự hỏng vẫn do try/catch của từng handler giữ.)

## 4. Loại ④ — lỗi render: hết đoán, đọc ở Admin

- `src/services/clientErrors.js` — `reportClientError()` gửi về `POST /api/telemetry/player`
  (`engine: "js"`, `keepalive: true` để gửi được cả lúc tab đang đóng), tự cắt trùng lặp
  (3 lần/loại, cooldown 15s, 12 lần/phiên) và **lọc nhiễu**: `ResizeObserver loop`,
  `AbortError`, `Failed to fetch` (đứt mạng không phải bug app).
- `installGlobalErrorHandlers()` (gắn ở `src/main.jsx`) bắt nốt `window.onerror`
  (kể cả lỗi tải script/ảnh, dùng capture) và `unhandledrejection` — tức là cả lỗi
  hls.js/Shaka nằm **ngoài** React, thứ mà ErrorBoundary không bao giờ thấy.
- `ErrorBoundary` vừa báo lỗi vừa hiện số lần lặp trong phiên + nút **Chép log** và
  **Bỏ qua, dùng tiếp** (một component hỏng không bắt cả app chết theo).
- Admin → tab “Lỗi player”: thêm badge `APP` cho lỗi JS và **sample** dòng message
  (`MAX(substr(detail,1,180))`), nên mở web là thấy "crash vì gì" thay vì hỏi người dùng.

### Khi nào cần làm gì
| Hiện tượng | Nghi | Việc |
|---|---|---|
| Màn "⚠️ Có lỗi bất ngờ xảy ra" | lỗi render | mở Admin → Lỗi player, lọc `code: render`; bấm "Chi tiết lỗi" |
| App quay vòng vòng rồi trắng | ①/② | `curl $BASE/api/playlist` xem có `data` không; xem console có `dùng N kênh đã cache` |
| Cả site 1027 / Error 1027 | hết quota Free | nâng Workers Paid (mở 30s CPU, bỏ 100k req/ngày) |
| Chỉ trên APK/TV, không có log React | WebView OOM / hls.js | xem `engine:'js'` + `engine:'hls'` trong Lỗi player |

## 5. Chạy lại sau khi sửa

```bash
npm run build
node scripts/crash-guard-check.mjs        # ①②④ 19 check (cần: npm i --no-save jsdom)
bash scripts/watermark-test.sh            # API watermark 33 check
node scripts/wm-admin-check.mjs           # UI tab admin 19 check
BASE=http://127.0.0.1:8787 bash scripts/acceptance-test.sh   # 61 check (toàn bộ)
```

Lưu ý khi test local: `wrangler dev` **hot-reload** mỗi lần lưu `worker/worker.js` và cắt
ngang mọi request đang chạy — đó là lý do một số check fail *random* lúc đang sửa code,
không phải bug của app. Ngoài ra `/auth/register` giới hạn **5 tài khoản/giờ/IP**, nên chạy
acceptance 6 lần liên tiếp sẽ fail ở bước tạo user free (fail này là của test, không phải của app).
