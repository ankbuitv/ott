// Render frame test card SMPTE + đồng hồ MM:SS ra buffer YUV420p (pure JS, không cần font hệ thống).
import { glyphRows, GLYPH_W, GLYPH_H } from "./font5x7.mjs";

// ---------------------------------------------------------------------------
// Màu YUV (BT.601 limited range 16-235) — các vạch màu SMPTE 75%
// ---------------------------------------------------------------------------
export const YUV = {
  gray75: [181, 128, 128],
  yellow75: [162, 44, 142],
  cyan75: [132, 156, 44],
  green75: [113, 72, 58],
  magenta75: [84, 184, 198],
  red75: [65, 100, 212],
  blue75: [35, 212, 114],
  black: [16, 128, 128],
  white: [235, 128, 128],
};

const BARS = ["gray75", "yellow75", "cyan75", "green75", "magenta75", "red75", "blue75"];
const MID_STRIP = ["blue75", "black", "magenta75", "black", "cyan75", "black", "gray75"];
// PLUGE: đen 0%, các mức gần đen, trắng 75%, đen
const PLUGE = [16, 30, 44, 58, 16, 180, 16];

export class Card {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const px = w * h;
    this.base = { y: new Uint8Array(px), u: new Uint8Array(px >> 2), v: new Uint8Array(px >> 2) };
    this.buf = { y: new Uint8Array(px), u: new Uint8Array(px >> 2), v: new Uint8Array(px >> 2) };
  }

  // ---- vẽ hình khối (Y + U + V) ----
  fillRect(plane, x0, y0, rw, rh, val) {
    const { w } = this;
    const p = plane;
    for (let y = y0; y < y0 + rh && y < this.h; y++) {
      const row = y * w;
      for (let x = x0; x < x0 + rw && x < w; x++) p[row + x] = val;
    }
  }

  fillRectYUV(c, x0, y0, rw, rh, [y, u, v]) {
    if (x0 < 0) { rw += x0; x0 = 0; }
    if (y0 < 0) { rh += y0; y0 = 0; }
    this.fillRect(c.y, x0, y0, rw, rh, y);
    const cu = this.base.u; // tạm, sẽ set bên dưới cho cả base/buf qua tham số c
    void cu;
    const cw = this.w >> 1;
    const ux0 = x0 >> 1, uy0 = y0 >> 1, ux1 = (x0 + rw) >> 1, uy1 = (y0 + rh) >> 1;
    for (let y = uy0; y < uy1; y++) {
      for (let x = ux0; x < ux1; x++) {
        c.u[y * cw + x] = u;
        c.v[y * cw + x] = v;
      }
    }
  }

  // ---- vẽ text (chỉ phá luma, nền đã có chroma trung tính) ----
  // advance = (5+1)*scale
  textWidth(str, scale) {
    return str.length * (GLYPH_W + 1) * scale - scale;
  }

  drawText(c, str, x, y, scale, yVal = 235) {
    let cx = x;
    for (const ch of str) {
      const rows = glyphRows(ch);
      for (let r = 0; r < GLYPH_H; r++) {
        const bits = rows[r];
        for (let b = 0; b < GLYPH_W; b++) {
          if (!(bits & (1 << (GLYPH_W - 1 - b)))) continue;
          // pixel block scale x scale
          const px0 = cx + b * scale, py0 = y + r * scale;
          for (let dy = 0; dy < scale; dy++) {
            const row = (py0 + dy) * this.w;
            for (let dx = 0; dx < scale; dx++) {
              const xx = px0 + dx;
              if (xx >= 0 && xx < this.w && py0 + dy >= 0 && py0 + dy < this.h) c.y[row + xx] = yVal;
            }
          }
        }
      }
      cx += (GLYPH_W + 1) * scale;
    }
  }

  drawTextCentered(c, str, y, scale, yVal = 235) {
    const x = ((this.w - this.textWidth(str, scale)) >> 1) & ~1;
    this.drawText(c, str, x, y, scale, yVal);
  }

  chipText(c, str, x, y, scale, pad = 2) {
    const w = this.textWidth(str, scale) + pad * 2;
    const h = GLYPH_H * scale + pad * 2;
    //even align
    const ex = x & ~1, ey = y & ~1;
    this.fillRectYUV(c, ex, ey, w + (w & 1), h + (h & 1), YUV.black);
    this.drawText(c, str, ex + pad, ey + pad, scale, 235);
  }

  // ---- dựng phần TĨNH của card (gọi 1 lần) ----
  buildBase({ brand, dateText }) {
    const { w, h } = this;
    const c = this.base;
    const barH = Math.floor(h * 0.7); // 151

    // 7 vạch màu SMPTE
    for (let x = 0; x < w; x++) {
      const bi = Math.min(6, Math.floor((x * 7) / w));
      const [y, u, v] = YUV[BARS[bi]];
      for (let yy = 0; yy < barH; yy++) c.y[yy * w + x] = y;
    }
    for (let yy = 0; yy < barH >> 1; yy++) {
      for (let xx = 0; xx < w >> 1; xx++) {
        const bi = Math.min(6, Math.floor(((xx << 1) * 7) / w));
        c.u[yy * (w >> 1) + xx] = YUV[BARS[bi]][1];
        c.v[yy * (w >> 1) + xx] = YUV[BARS[bi]][2];
      }
    }

    // dải giữa
    const midY = barH, midH = Math.floor(h * 0.1);
    for (let yy = midY; yy < midY + midH; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const bi = Math.min(6, Math.floor((xx * 7) / w));
        c.y[yy * w + xx] = YUV[MID_STRIP[bi]][0];
      }
    }
    for (let yy = midY >> 1; yy < (midY + midH) >> 1; yy++) {
      for (let xx = 0; xx < w >> 1; xx++) {
        const bi = Math.min(6, Math.floor(((xx << 1) * 7) / w));
        c.u[yy * (w >> 1) + xx] = YUV[MID_STRIP[bi]][1];
        c.v[yy * (w >> 1) + xx] = YUV[MID_STRIP[bi]][2];
      }
    }

    // nền đen phần dưới
    const botY = midY + midH;
    this.fillRectYUV(c, 0, botY, w, h - botY, YUV.black);

    // PLUGE
    const pw = Math.floor(w / PLUGE.length);
    PLUGE.forEach((val, i) => this.fillRect(c.y, i * pw, botY, pw, 6, val));

    // caption dưới
    this.drawTextCentered(c, "KENH THU NGHIEM - TEST CARD CHANNEL", botY + 10, 1, 235);
    this.drawTextCentered(c, "HLS: /test.m3u8   DASH: /test.mpd   VLC OK", botY + 22, 1, 235);

    // chips trên cùng
    this.chipText(c, brand, 4, 4, 1);
    const dw = this.textWidth(dateText, 1);
    this.chipText(c, dateText, w - dw - 10, 4, 1);

    // hộp đồng hồ giữa card
    const boxW = 200, boxH = 70;
    const bx = ((w - boxW) >> 1), by = 36;
    this.fillRectYUV(c, bx, by, boxW, boxH, YUV.black);
    // viền trắng 2px
    this.fillRect(c.y, bx, by, boxW, 2, 235);
    this.fillRect(c.y, bx, by + boxH - 2, boxW, 2, 235);
    this.fillRect(c.y, bx, by, 2, boxH, 235);
    this.fillRect(c.y, bx + boxW - 2, by, 2, boxH, 235);

    // nhãn nhỏ trong hộp
    this.drawTextCentered(c, "PHUT : GIAY (MOI GIO QUAY VONG)", by + boxH - 12, 1, 235);

    return c;
  }

  // ---- vẽ 1 frame động (đồng hồ) lên bản sao của base ----
  // Hiển thị MM:SS (phút:giây TRONG GIỜ) — vòng lặp 1 giờ => luôn khớp giờ thật
  frame({ mm, ss }) {
    const c = this.buf;
    c.y.set(this.base.y);
    c.u.set(this.base.u);
    c.v.set(this.base.v);

    const { w } = this;
    // MM:SS scale 4 (to, rõ)
    const str = String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    const scale = 4;
    const tw = this.textWidth(str, scale);
    const x = ((w - tw) >> 1) & ~1;
    const y = 46;
    this.drawText(c, str, x, y, scale, 235);

    // thanh "đo" giây quét từ trái sang phải (đồng hồ đo kiểu test card)
    const barW = 120, barH2 = 4;
    const bx = ((w - barW) >> 1) & ~1, by = 48 + 7 * scale + 6;
    this.fillRect(c.y, bx, by, barW, barH2, 60); // nền mờ
    const filled = Math.round((barW - 2) * (ss / 59));
    if (filled > 0) this.fillRect(c.y, bx + 1, by + 1, filled, barH2 - 2, 235);

    return c;
  }
}
