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
| `https://<worker>/test.m3u8` | **HLS** — VLC, hls.js, Safari, Smart TV... |
| `https://<worker>/live.m3u8` | HLS biến thể `PROGRAM-DATE-TIME: 1970-01-01` (tương thích player cũ) |
| `https://<worker>/test.mpd` | **DASH** — dash.js, VLC... |
| `https://<worker>/` | Trang web xem thử (HLS/DASH toggle) |
| `https://<worker>/healthz` | Kiểm tra worker sống |

## Xem bằng VLC

Media → Open Network Stream → dán `https://<worker>/test.m3u8`.
Muốn lặp liên tục: bật **Loop** (VLC tự lặp hết playlist), hoặc chạy lệnh:

```bash
vlc --loop https://<worker>/test.m3u8
```

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
