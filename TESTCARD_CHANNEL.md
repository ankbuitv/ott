# 📺 TEST CARD CHANNEL — Kênh test card tự sinh, phát liên tục 24/7

Kênh **test card kiểu truyền hình** (vạch màu SMPTE + đồng hồ chạy + tone 1kHz) được
**tự sinh và encode sẵn thành 3600 segment MPEG-TS** (1 giây/segment, bọc trọn 1 giờ),
serve qua Cloudflare Worker + static assets.

- Không cần ffmpeg trên worker, không transcode lúc chạy — chỉ phục vụ file tĩnh.
- Đồng hồ `PHÚT:GIÁY` in trong video **khớp giờ thật mỗi giờ** (quay vòng): nhìn card
  đối chiếu đồng hồ là biết player bị trễ/buffer bao nhiêu — đúng chức năng "đồng hồ đo"
  của test card truyền hình.

## Link kênh

| Link | Kênh |
|---|---|
| `https://<worker>/test.m3u8` | **HLS mở** — VLC, hls.js, Safari, Smart TV... |
| `https://<worker>/live.m3u8` | HLS biến thể `PROGRAM-DATE-TIME: 1970-01-01` (tương thích player cũ) |
| `https://<worker>/test-clear.mpd` | **DASH mở** (không mã hoá) |
| `https://<worker>/test.mpd` | **DASH MÃ HOÁ CENC + ClearKey** — cần license key mới xem được 🔒 |
| `https://<worker>/license` | License server ClearKey chuẩn EME (`POST {"kids":[...]}`) + `GET` tra cứu key & snippet Kodi |
| `https://<worker>/` | Trang web xem thử (HLS / DASH mở / DASH ClearKey) |
| `https://<worker>/healthz` | Kiểm tra worker sống |

## Kênh ClearKey (DASH mã hoá)

Media mã hoá **CENC (AES-128-CTR)** bằng Bento4, MPD có đầy đủ `ContentProtection`
(`cenc:default_KID` + ClearKey signaling). Không có key → decoder báo lỗi hình (đã test).

### Xem bằng Kodi (inputstream.adaptive)

Đặt file `.strm`/`.m3u` với nội dung (xem key thật tại `GET /license`):

```
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=<KID>:<KEY>
https://<worker>/test.mpd
```

### Xem bằng trình duyệt

Trang `/` có nút **"🔒 DASH ClearKey (/test.mpd)"** — dash.js tự gọi `/license` (chuẩn EME) rồi phát.

### Đổi key (custom license key)

1. Sửa `CLEARKEY = "KID:KEY"` trong `wrangler.testcard-channel.toml`
   (hoặc giấu đi: `npx wrangler secret put CLEARKEY`)
2. Mã hoá lại media với cùng cặp key:

```bash
cd worker/testcard-tools
bash build-bento4.sh /tmp/bin          # lần đầu (cần g++, python3, git)
node encode-key.mjs --seconds 3600 \
  --kid <32hex> --key <32hex> \
  --ffmpeg /duong/dan/ffmpeg --exec-dir /tmp/bin
```

3. `npx wrangler deploy -c wrangler.testcard-channel.toml`

Chạy `encode-key.mjs` **không có** `--kid/--key` sẽ tự sinh key ngẫu nhiên (in ra log + `keyk/key.json`).

> ⚠️ Đổi key ở config mà **không** mã hoá lại segment → key không khớp media → không player nào giải được (đó là lý do phải chạy cả 2 bước).
> KID/KEY phải là 32 ký tự hex mỗi bên (`0-9a-f`), đúng dạng Kodi dùng.

## Xem bằng VLC (kênh HLS/DASH mở)

Media → Open Network Stream → dán `https://<worker>/test.m3u8` (hoặc `/test-clear.mpd`).
Muốn lặp liên tục: bật **Loop**, hoặc: `vlc --loop https://<worker>/test.m3u8`.
(VLC chưa hỗ trợ ClearKey — kênh mã hoá xem bằng Kodi/dash.js.)

## Deploy

```bash
npx wrangler deploy -c wrangler.testcard-channel.toml
```

Xong là có `https://test-card-channel.<subdomain>.workers.dev/test.m3u8`.

## Thông số kỹ thuật kênh

| Hạng mục | Giá trị |
|---|---|
| Độ phân giải | 384×216 (16:9) |
| Codec | H.264 Constrained Baseline L3.0 + AAC-LC (tone 1kHz, 8kHz mono) |
| Frame rate | 1 fps (all-intra — mỗi frame là keyframe, splice/chuyển đoạn sạch) |
| Segment | 3600 × .ts (1 giây) ≈ 43 MB,PTS đo thực tế → EXTINF chính xác từng ms |
| Bitrate | ~95 kbps tổng |
| Chi phí | 1 viewer ≠ tốn thêm: mọi request trúng CDN cache của Cloudflare |

## Tái sinh / đổi thương hiệu (tùy chọn)

Tool sinh card + encode nằm ở `worker/testcard-tools/` (cần Node.js + ffmpeg có libx264):

```bash
cd worker/testcard-tools
node encode.mjs --seconds 3600 --out ../../testcard-assets/seg \
  --brand "TENBAN" --date "GMT+7 24/7" \
  --ffmpeg /duong/dan/ffmpeg
# đo PTS rồi sinh lại manifest:
/tmp/measure.sh > /tmp/starts.txt   # xem README trong thư mục tools
node manifests.mjs
```

Đổi `BRAND` trong `wrangler.testcard-channel.toml` chỉ đổi tên trên **trang web**;
đổi chữ **trong video** phải tái sinh segment như trên.

## Code

- Worker: `worker/testcard-worker.js` + `wrangler.testcard-channel.toml`
- Assets: `testcard-assets/` (`seg/*.ts`, `hls/*.m3u8`, `dash/test.mpd`)
- Tools tái sinh: `worker/testcard-tools/`
