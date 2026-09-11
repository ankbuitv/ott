# 💧 LOGO WATERMARK — đắp logo của web lên khung hình khi phát

Tính năng: trong lúc người xem đang xem kênh TV / luồng `.m3u8`, app vẽ logo **của
chính web** (mặc định `public/watermark.svg`, 512×512, nền trong suốt) lên một góc
khung hình. Admin chỉnh được **vị trí theo từng kênh** bằng khung kéo, không cần
đụng code, không cần build lại app.

```
┌──────────────────────────────┐
│  KHUNG HÌNH 16:9         ⬤   │ ← logo (kéo thả được, tự hít vào 9 điểm bám)
│                              │
│              ▸               │
│                              │
│                              │
└──────────────────────────────┘
```

---

## 1. Hai lớp cấu hình

| Lớp | Lưu ở | Ai sửa | Ý nghĩa |
|---|---|---|---|
| **Chung** | D1 `site_config` key `watermark` (JSON) | Admin → *Logo khi phát* | Áp dụng cho mọi kênh |
| **Theo kênh** | D1 `channel_watermark` (`channel_id`, `wm` JSON) | Cùng tab, mục "Tuỳ chỉnh theo từng kênh" | Chỉ ghi đè những trường admin thực sự chỉnh |
| Logo upload | `site_config` key `watermark_logo` (SVG đã sanitize) | Nút "Chọn PNG/SVG" | Có logo này thì `logo_url` tự trỏ `/api/watermark/logo?v=<version>` |

Thứ tự ưu tiên khi render:

```
channel.wm.mode === 'off'  → ẩn
channel.wm (từng trường)   → đè lên cấu hình chung
cấu hình chung             → site_config.watermark
mặc định của app           → WM_DEFAULTS trong src/services/watermark.js
```

**Vì sao để `channel_watermark` ở bảng riêng thay vì thêm cột vào `channels`:**
`writeChannels()` nạp lại M3U theo kiểu `DELETE FROM channels` + INSERT hàng loạt
(chạy ở lần gọi `/api/playlist` đầu tiên và mỗi lần `?refresh=1`). Cột nằm trong
`channels` sẽ bay theo mỗi đợt refresh; bảng riêng thì không ảnh hưởng — cùng mô-típ
với `channel_health`.

---

## 2. API

| Endpoint | Quyền | Tác dụng |
|---|---|---|
| `GET /api/watermark` | công khai, cache `max-age=20, s-maxage=120` | Cấu hình chung + `logo_url`. Client chỉ gọi 1 lần/4 phút (mem + localStorage) |
| `GET /api/watermark/logo` | công khai, cache 7 ngày `immutable` | Phát nội dung SVG admin đã upload (đã sanitize lúc lưu). Chưa có → 302 về `/watermark.svg` |
| `GET /admin/watermark` | admin | Cấu hình + danh sách kênh có tuỳ chỉnh + danh sách nhóm |
| `POST /admin/watermark` | admin | Lưu cấu hình chung |
| `POST /admin/watermark/logo` | admin | Lưu logo. Nhận `{svg}` (markup) hoặc `{image:"data:image/png;base64,…"}` → **server tự bọc PNG thành SVG** |
| `DELETE /admin/watermark/logo` | admin | Xoá logo upload, quay về file trong app |
| `POST /admin/watermark/channel` | admin | `{channel_id, wm}` — `wm` rỗng = xoá tuỳ chỉnh |
| `DELETE /admin/watermark/channel` | admin | `{channel_id}` |
| `POST /admin/watermark/group` | admin | `{group_title, wm}` — áp hàng loạt cho cả nhóm kênh |
| `POST /admin/watermark/clear-all` | admin | Dọn mọi tuỳ chỉnh kênh |

`/api/playlist` và `/api/channels` giờ kèm thêm `wm` (object, chỉ khi kênh có tuỳ
chỉnh) nên player biết vị trí riêng của kênh **mà không cần gọi thêm request nào**.

## 3. Trường cấu hình

| Trường | Giá trị | Ghi chú |
|---|---|---|
| `enabled` | 0/1 | Bật/tắt toàn hệ thống |
| `pos` | `tl tc tr ml mr bl bc br` / `custom` | 9 điểm bám + "tự do". Mặc định `tr` |
| `x`, `y` | 0–100 (% của khung hình) | Tâm hộp logo; chỉ dùng khi `pos = custom` |
| `size` | 2–40 (% **chiều cao** khung) | % chiều cao nên logo tỉ lệ đúng trên mọi cỡ màn hình |
| `opacity` | 5–100 | |
| `margin` | 0–20 (%) | Cách mép khi bám góc/cạnh |
| `style` | `plain` `shadow` `plate` `glass` | nền đứng sau logo + viền đổ bóng |
| `tint` | `none` `white` `black` | Lọc màu bằng CSS filter, hữu dụng khi logo màu mè trên nền video sáng |
| `text`, `text_pos` | chuỗi ≤48 ký tự; `none/right/bottom/top` | Dòng mô tả đi kèm logo |
| `fit` | `video` / `container` | `video` = tính theo hộp ảnh thật (bỏ dải letterbox 21:9, khung dọc mobile) |
| `pages` | `tv player mini movie` | Trang TV / cửa sổ player / player mini / phim |
| `only_live` | 0/1 | 1 = ẩn trên phim & catch-up |
| `hide_buffering` | 0/1 | Ẩn lúc đang loader |
| `logo_url` | `/watermark.svg`, `/api/watermark/logo?v=…` hoặc URL https | Để trống = logo trong app |

Chuẩn hoá **hai đầu**: `normalizeWatermark()` trong `worker/worker.js` (chặn giá trị
lạ, chặn chuỗi phá HTML) và `saneConfig()` trong `src/services/watermark.js` (client
không bao giờ nhận số NaN / ngoài khoảng).

## 4. Logo: PNG → SVG

Logo khuyến nghị: **SVG, vuông 512×512, nền trong suốt**. Nếu đang có PNG:

- **Trong app (không cần cài gì):** Admin → *Logo khi phát* → *Chọn PNG / JPG / WEBP / SVG*.
  Trình duyệt đọc ảnh bằng canvas, **tự cắt phần viền trong suốt thừa**, rồi đặt dữ liệu
  ảnh vào `<image>` bên trong một file `<svg>` có `viewBox` đúng kích thước thật → gửi lên
  `POST /admin/watermark/logo`. Kết quả là file SVG hợp lệ, giữ nguyên 100% độ nét và kênh
  alpha, không cần thư viện trace nào.
- **Bằng lệnh (muốn có file trong repo):**

  ```bash
  node scripts/png-to-svg.mjs brand/chrtv-logo-1024.png          # → brand/chrtv-logo-1024.svg
  node scripts/png-to-svg.mjs logo.png watermark.svg --size 512 # ép rộng 512, cao theo tỉ lệ
  ```
  (Có ImageMagick thì script tự cắt viền trong suốt; không có vẫn chạy, chỉ giữ nguyên khổ.)

Hai file đã chuyển sẵn trong repo: `brand/chrtv-logo-1024.svg`, `brand/chrtv-logo-lockup-dark.svg`
— lưu ý **icon PNG gốc có nền đen bo góc**, đắp lên video sẽ thành một mảng đen, nên
logo mặc định dùng cho watermark là `public/watermark.svg` (chỉ còn vòng tròn + nút play
+ chấm cam, nền trong suốt, vẽ bằng path nên nhẹ và nét).

**An toàn khi nhận SVG:** SVG được lưu và phát lại cho mọi người xem, nên worker gỡ
`<script>`, `on*=` , `foreignObject`, `<!ENTITY>`, `<?xml-stylesheet?>` và mọi
`href/src` trỏ ra ngoài (chỉ cho `#neo-trong-file` và `data:image/…`) — xem
`sanitizeSvg()`. Dung lượng tối đa 256 KB. Ảnh chỉ render qua `<img>` nên SVG không
chạy được script dù sao nữa.

## 5. Phía client

- `src/services/watermark.js` — cache + `resolveWatermark()` + các hàm tính CSS
  (`wmBoxStyle`, `wmFilterFor`, `wmPlateStyle`, `wmSnapFromCenter`). **Không** chứa JSX.
- `src/components/StreamWatermark.jsx` — lớp overlay `pointer-events:none`,
  `z-index:12` (dưới control bar z-20, trên video), `select-none`, `-webkit-user-drag:none`,
  fade-in 0.3s, ẩn khi buffering nếu bật. `onError` của ảnh → ẩn hẳn (không hiện khung vỡ).
- `src/hooks/useVideoContentRect.js` — đo hộp ảnh thật trong container theo
  `object-contain` (ResizeObserver + `loadedmetadata` + `fullscreenchange`) để `fit:'video'`
  đặt logo sát góc **ảnh**, không rơi vào dải đen.
- Chỗ gắn overlay: `VideoPlayer.jsx` (cửa sổ player + mini), `TVPage.jsx`
  (`SimpleHlsPlayer` — trang TV), `MoviePlayerModal.jsx` (chỉ với nguồn `kind:'hls'`
  do app tự phát; không đóng dấu lên player iframe đối tác).
- URL luôn được ghép `API_BASE` (`absUrl`) nên APK/Android TV (origin `capacitor:`/
  `localhost`) vẫn lấy được logo.
- Mất mạng / Worker chưa có D1 → `fetchWatermark()` trả `WM_DEFAULTS`, logo vẫn hiện.

## 6. Kiểm tra nhanh

```bash
curl -s https://play.ankb.qzz.io/api/watermark | head -c 400   # JSON config, có logo_url + version
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://play.ankb.qzz.io/watermark.svg
curl -s -o /dev/null -w '%{http_code}\n' "https://play.ankb.qzz.io/api/playlist" # 200, mỗi kênh có thể kèm "wm"
```

Test tự động (không cần trình duyệt):

```bash
bash scripts/watermark-test.sh              # 33 check API: config, clamp, sanitize, per-channel, auth, audit
ONLY=15 BASE=http://127.0.0.1:8787 bash scripts/acceptance-test.sh   # 15 check acceptance [15]
node scripts/wm-admin-check.mjs             # 19 check UI tab Admin (jsdom) — dev-only, cần
                                            # `npm i --no-save jsdom react-test-renderer@18.3.1`
```

Trong Admin → *Logo khi phát*: kéo logo vào góc trái-dưới → Lưu → tải lại trang TV
(hoặc chờ ≤4 phút cache) → logo nằm góc trái-dưới. Bấm "Tắt kênh này" trên đúng kênh
đó → logo biến mất ở kênh đó, các kênh khác vẫn còn.

## 7. Nói thẳng về giới hạn

Đây là **nước + branding**, không phải lớp bảo vệ:

- Watermark nằm trong DOM → ai biết DevTools xoá được node. Muốn chống cào nội dung
  thì việc đó thuộc `CHONG_RIP_STREAM.md` (token + proxy + entitlement), không phải ở đây.
- Picture-in-Picture, Chromecast/AirPlay và các app ngoài chỉ nhận mỗi thẻ `<video>`
  ⇒ **logo không hiện** ở những đường ra đó. Muốn đóng dấu mọi trường hợp thì phải
  burn-in khi transcode ở nguồn phát.
- Không có "kéo logo" cho người xem: khung kéo chỉ nằm trong Admin; người xem chỉ thấy
  kết quả cuối cùng.

## 8. Deploy

```bash
npm run build && npx wrangler deploy
```

Schema tự tạo (`site_config`, `channel_watermark` nằm trong `SCHEMA_STATEMENTS` +
`ensureSchema()`), không phải chạy SQL tay.
