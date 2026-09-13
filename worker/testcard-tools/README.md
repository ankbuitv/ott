# Tools tái sinh kênh TEST CARD

Sinh frame card (pure JS, font bitmap 5x7 tự dựng) → pipe thô YUV420p cho ffmpeg
(libx264) → 3600 segment `.ts` → đo PTS thật → sinh manifest HLS/DASH.

## Cần chuẩn bị

- Node.js 18+
- **ffmpeg có libx264** (bản static của johnvansickle hoặc cài qua gói hệ thống)
- ffprobe (tuỳ chọn, để kiểm tra)

## Các bước

```bash
cd worker/testcard-tools

# 1. Encode 3600 segment (bọc trọn 1 giờ, ~1-2 phút)
node encode.mjs --seconds 3600 --out ../../testcard-assets/seg \
  --brand "CHRTV" --date "GMT+7 24/7" \
  --ffmpeg /duong/dan/ffmpeg

# 2. Đo start PTS của từng segment (để EXTINF chính xác từng ms)
FF=/duong/dan/ffmpeg bash -c '
DIR=../../testcard-assets/seg
one() { s=$($FF -hide_banner -nostats -t 0.001 -i "$1" -f null - 2>&1 | grep -m1 -o "start: [0-9.]*" | cut -d" " -f2); echo "$(basename $1 .ts) $s"; }
export -f one; export FF
ls $DIR/*.ts | xargs -P 8 -I{} bash -c "one {}" > /tmp/starts.txt
'

# 3. Sinh manifest HLS (test-sll.m3u8, test-slr.m3u8) + DASH (test.mpd)
node manifests.mjs

# 4. Deploy
npx wrangler deploy -c wrangler.testcard-channel.toml
```

## File

| File | Vai trò |
|---|---|
| `font5x7.mjs` | Font bitmap 5×7 (chữ/số in lên card) |
| `render.mjs` | Vẽ card SMPTE + hộp đồng hồ MM:SS ra buffer YUV420p |
| `encode.mjs` | Pipe frame → ffmpeg libx264 + AAC tone 1kHz → segment .ts |
| `manifests.mjs` | Đọc `/tmp/starts.txt` (PTS đo được) → sinh HLS/DASH manifest |

## Tham số encode.mjs

`--seconds N` (mặc định 3600) · `--w 384 --h 216 --fps 1` · `--crf 32` ·
`--ab 16k` (bitrate audio) · `--sr 8000` (sample rate tone) · `--brand` `--date`
(chữ góc trên card) · `--tone 0` (tắt tiếng) · `--ffmpeg <path>`
