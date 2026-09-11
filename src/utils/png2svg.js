/**
 * PNG → SVG NGAY TRONG TRÌNH DUYỆT (dùng cho phần upload logo watermark).
 *
 * Cách chuyển: đọc ảnh bằng canvas, TỰ CẮT bỏ phần viền trong suốt thừa, rồi đặt
 * dữ liệu ảnh vào <image> bên trong một file <svg> có viewBox đúng kích thước thật.
 * Kết quả là file SVG hợp lệ, giữ nguyên 100% độ nét + kênh alpha (trong suốt),
 * không cần thư viện trace trên server và không làm hỏng logo.
 *
 * Muốn SVG dạng đường vector thuần (potrace/vtracer) thì cứ xuất rồi dán vào ô
 * "Dán markup SVG" — panel nhận cả hai.
 */

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("Không đọc được file"));
    fr.readAsDataURL(file);
  });
}

export function looksLikeSvg(text) {
  const s = String(text || "").trim();
  return /<svg[\s>]/i.test(s) && /<\/svg>/i.test(s);
}

/** Bỏ comment + khoảng trắng thừa cho nhẹ file (không đụng nội dung vẽ). */
export function minifySvg(svg) {
  return String(svg || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh (file hỏng hoặc sai định dạng)"));
    img.src = src;
  });
}

/** Khung bao các pixel còn nhìn thấy (alpha > threshold) — để cắt viền trong suốt. */
function alphaBoundingBox(ctx, w, h, threshold = 6) {
  let img;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // canvas bị ô nhiễm (ảnh khác domain) -> không đọc được pixel
  }
  const d = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (d[(row + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * @param {string} src      data: URL của PNG/JPG/WEBP, hoặc markup SVG
 * @param {object} opts     { trim = true, maxSide = 0 (0 = giữ nguyên), pad = 0 (px đệm sau khi cắt) }
 * @returns {Promise<{svg,dataUrl,width,height,bytes,converted}>}
 */
export async function imageToSvg(src, opts = {}) {
  const { trim = true, maxSide = 0, pad = 0 } = opts;

  if (looksLikeSvg(src)) {
    const svg = minifySvg(src);
    return { svg, dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width: 0, height: 0, bytes: svg.length, converted: false };
  }

  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width || 512;
  const ih = img.naturalHeight || img.height || 512;

  // Vẽ ra canvas để đo + cắt (và hạ cỡ nếu maxSide > 0)
  let scale = 1;
  if (maxSide > 0) scale = Math.min(1, maxSide / Math.max(iw, ih));
  const cw = Math.max(1, Math.round(iw * scale));
  const chh = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = chh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, cw, chh);

  let sx = 0, sy = 0, sw = cw, sh = chh;
  if (trim) {
    const box = alphaBoundingBox(ctx, cw, chh);
    if (box && box.w > 4 && box.h > 4) {
      const p = Math.max(0, pad | 0);
      sx = Math.max(0, box.x - p);
      sy = Math.max(0, box.y - p);
      sw = Math.min(cw - sx, box.w + (box.x - sx) + p);
      sh = Math.min(chh - sy, box.h + (box.y - sy) + p);
    }
  }

  let outCanvas = canvas;
  let ow = sw, oh = sh;
  const cropped = trim && (sx !== 0 || sy !== 0 || sw !== cw || sh !== chh);
  if (cropped) {
    outCanvas = document.createElement("canvas");
    outCanvas.width = sw;
    outCanvas.height = sh;
    outCanvas.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  const dataUrl = outCanvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1] || "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}" viewBox="0 0 ${ow} ${oh}">` +
    `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${ow}" height="${oh}" preserveAspectRatio="xMidYMid meet"/>` +
    `</svg>`;
  return { svg, dataUrl, width: ow, height: oh, bytes: svg.length, converted: true, cropped };
}

/** Đổi dung lượng thành chuỗi dễ đọc cho UI admin. */
export function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(2)} MB`;
}
