// Sinh manifest HLS (SLL + SLR) và DASH MPD từ số liệu đo start PTS thật của từng segment.
// Kết quả ghi vào testcard-assets/hls/ và testcard-assets/dash/
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, "..", "..", "testcard-assets");

const lines = readFileSync("/tmp/starts.txt", "utf8")
  .trim()
  .split("\n")
  .map((l) => l.split(" "))
  .map(([n, s]) => ({ n: Number(n), start: Number(s) }))
  .sort((a, b) => a.n - b.n);

if (lines.length !== 3600) throw new Error("Thiếu segment: " + lines.length);

// duration[i] = start[i+1] - start[i]; segment cuối = start[cuối] + 1.0 (mẫu chuẩn 1s)
const durations = [];
for (let i = 0; i < lines.length; i++) {
  if (i < lines.length - 1) durations.push(+(lines[i + 1].start - lines[i].start).toFixed(3));
  else durations.push(1.0);
}
const TOTAL = lines[lines.length - 1].start + durations[durations.length - 1];
console.log("segments:", lines.length, "tổng:", TOTAL + "s", "d[0]=", durations[0], "d[1]=", durations[1]);

// ---------------- HLS SLL (chuẩn) ----------------
let sll = "#EXTM3U\n#EXT-X-VERSION:3\n";
sll += "# UI-BEN-TREN: KENH TEST CARD - VONG LAP 1 GIO (00:00 -> 59:59 PHUT:GIAY)\n";
sll += "# HLS: /test.m3u8 - DASH: /test.mpd - XEM BANG VLC, HLS.JS, SAFARI...\n";
sll += "#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n";
lines.forEach((seg, i) => {
  sll += `#EXTINF:${durations[i].toFixed(3)},\n/seg/${seg.n.toString().padStart(4, "0")}.ts\n`;
});
sll += "#EXT-X-ENDLIST\n";
mkdirSync(path.join(ASSETS, "hls"), { recursive: true });
writeFileSync(path.join(ASSETS, "hls", "test-sll.m3u8"), sll);

// ---------------- HLS SLR (self-contained PDT 1970) ----------------
let slr = "#EXTM3U\n#EXT-X-VERSION:3\n";
slr += "# UI-BEN-TREN: KENH TEST CARD - VONG LAP 1 GIO (00:00 -> 59:59 PHUT:GIAY)\n";
slr += "# HLS: /test.m3u8 - DASH: /test.mpd - XEM BANG VLC, HLS.JS, SAFARI...\n";
slr += "#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n";
slr += "#EXT-X-PROGRAM-DATE-TIME:1970-01-01T00:00:00.000+00:00\n";
lines.forEach((seg, i) => {
  slr += `#EXTINF:${durations[i].toFixed(3)},\n/seg/${seg.n.toString().padStart(4, "0")}.ts\n`;
});
slr += "#EXT-X-ENDLIST\n";
writeFileSync(path.join(ASSETS, "hls", "test-slr.m3u8"), slr);

// ---------------- DASH MPD (SegmentTemplate $Time$, timescale 90000) ----------------
// t_i = round(start_i * 90000); d_i = t_{i+1} - t_i; cuoi = 90000
const T = lines.map((s) => Math.round(s.start * 90000));
const D = [];
for (let i = 0; i < T.length; i++) {
  D.push(i < T.length - 1 ? T[i + 1] - T[i] : 90000);
}
// Gộp timeline: S (t=0, d0), S (d, r=3598)
const first = T[0];
const d0 = D[0];
const dRest = D[1];
const restCount = D.length - 1; // 3599 mục còn lại, tất cả = 90000
if (D.some((d, i) => i > 1 && d !== dRest)) throw new Error("Duration không đều!");
const periodDur = T[T.length - 1] + D[D.length - 1] - first;

let mpd = `<?xml version="1.0" encoding="UTF-8"?>\n`;
mpd += `<!-- KENH TEST CARD - VONG LAP 1 GIO (00:00 -> 59:59 PHUT:GIAY) | HLS: /test.m3u8 -->\n`;
mpd += `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT${(periodDur / 90000).toFixed(3)}S" minBufferTime="2.0">\n`;
mpd += `  <Period id="0" start="PT0S" duration="PT${(periodDur / 90000).toFixed(3)}S">\n`;
mpd += `    <AdaptationSet id="0" contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1" maxWidth="384" maxHeight="216" maxFrameRate="1" par="16:9">\n`;
mpd += `      <SegmentTemplate timescale="90000" media="/seg/$Number%04d$.ts" startNumber="0" presentationTimeOffset="${first}">\n`;
mpd += `        <SegmentTimeline><S t="${first}" d="${d0}" /><S d="${dRest}" r="${restCount - 1}" /></SegmentTimeline>\n`;
mpd += `      </SegmentTemplate>\n`;
mpd += `      <Representation id="testcard" bandwidth="73000" width="384" height="216" codecs="avc1.42c01e" audioSamplingRate="8000" />\n`;
mpd += `    </AdaptationSet>\n`;
mpd += `    <AdaptationSet id="1" contentType="audio" mimeType="audio/mp4" segmentAlignment="true" startWithSAP="1">\n`;
mpd += `      <SegmentTemplate timescale="90000" media="/seg/$Number%04d$.ts" startNumber="0" presentationTimeOffset="${first}">\n`;
mpd += `        <SegmentTimeline><S t="${first}" d="${d0}" /><S d="${dRest}" r="${restCount - 1}" /></SegmentTimeline>\n`;
mpd += `      </SegmentTemplate>\n`;
mpd += `      <Representation id="tone" bandwidth="8000" audioSamplingRate="8000" codecs="mp4a.40.2">\n`;
mpd += `        <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="1" />\n`;
mpd += `      </Representation>\n`;
mpd += `    </AdaptationSet>\n`;
mpd += `  </Period>\n`;
mpd += `</MPD>\n`;
mkdirSync(path.join(ASSETS, "dash"), { recursive: true });
writeFileSync(path.join(ASSETS, "dash", "test.mpd"), mpd);

console.log("Đã ghi: hls/test-sll.m3u8, hls/test-slr.m3u8, dash/test.mpd");
