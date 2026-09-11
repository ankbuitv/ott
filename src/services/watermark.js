/**
 * CHRTV WATERMARK — đắp logo CỦA WEB lên khung hình khi đang phát.
 * (Chi tiết: LOGO_WATERMARK.md)
 *
 * 2 lớp cấu hình, lớp kênh đè lớp chung:
 *   1. Cấu hình chung  → GET /api/watermark  (admin sửa ở Admin → Logo kênh)
 *   2. Tuỳ chỉnh theo kênh → nằm sẵn trong `channel.wm` của /api/playlist
 *      (`mode: 'on' | 'off'` để bật/cưỡng bức tắt riêng kênh đó, cộng các
 *       thông số vị trí/cỡ/độ mờ nếu có).
 *
 * File này KHÔNG render gì — chỉ chuẩn hoá số liệu + tính CSS để
 * <StreamWatermark/> và khung kéo trong admin dùng chung một công thức,
 * nhờ vậy "kéo ở admin thấy sao, người xem thấy vậy".
 */

import { useEffect, useState } from "react";
import { API_BASE } from "./config";

const LS_KEY = "chrtv_watermark_v1";
const LS_TTL_MS = 4 * 60 * 1000; // 4 phút — đủ để không spam API khi đổi kênh liên tục

export const WM_DEFAULTS = {
  enabled: 1,
  logo_url: "",
  pos: "tr", // tl | tr | bl | br | tc | bc | ml | mr | custom
  x: 92, // % tâm theo chiều RỘNG khung hình (chỉ dùng khi pos = custom)
  y: 8, // % tâm theo chiều CAO khung hình
  size: 9, // % chiều cao khung hình
  opacity: 82,
  margin: 3, // % cách mép khi bám góc
  style: "shadow", // plain | shadow | plate | glass
  tint: "none", // none | white | black
  text: "", // dòng mô tả kèm logo (tối đa 48 ký tự)
  text_pos: "none", // none | right | bottom | top
  fit: "video", // video = bỏ qua dải letterbox; container = theo cả khung
  pages: { tv: 1, player: 1, mini: 0, movie: 0 },
  only_live: 0,
  hide_buffering: 1,
  version: 0,
};

export const WM_PAGE_LABEL = {
  tv: "Trang TV (kênh đang phát)",
  player: "Cửa sổ player",
  mini: "Player mini (ghim góc)",
  movie: "Phim / catch-up",
};

/** Logo mặc định đóng gói trong app — admin thay bằng file khác qua panel, không cần build lại. */
export const WM_BUNDLED_LOGO = "/watermark.svg";

// ---------------------------------------------------------------- helpers ----

function clamp(n, min, max, dflt) {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(max, Math.max(min, v));
}

/** URL tương đối → tuyệt đối (APK/TV không có origin http nên phải ghép API_BASE). */
function absUrl(u) {
  const s = String(u || "");
  if (!s || /^(https?:|data:|blob:)/i.test(s)) return s;
  if (API_BASE) return API_BASE + (s.startsWith("/") ? s : `/${s}`);
  return s;
}

function saneConfig(raw) {
  const d = WM_DEFAULTS;
  const src = raw && typeof raw === "object" ? raw : {};
  const pagesIn = src.pages && typeof src.pages === "object" ? src.pages : {};
  const cfg = {
    enabled: src.enabled === 0 || src.enabled === "0" || src.enabled === false ? 0 : 1,
    logo_url: absUrl(src.logo_url || WM_BUNDLED_LOGO),
    pos: WM_POS_SET.has(String(src.pos || "")) ? String(src.pos) : d.pos,
    x: clamp(src.x, 0, 100, d.x),
    y: clamp(src.y, 0, 100, d.y),
    size: clamp(src.size, 2, 40, d.size),
    opacity: clamp(src.opacity, 5, 100, d.opacity),
    margin: clamp(src.margin, 0, 20, d.margin),
    style: WM_STYLE_SET.has(String(src.style || "")) ? String(src.style) : d.style,
    tint: WM_TINT_SET.has(String(src.tint || "")) ? String(src.tint) : d.tint,
    text: String(src.text || "").slice(0, 48),
    text_pos: WM_TEXT_SET.has(String(src.text_pos || "")) ? String(src.text_pos) : d.text_pos,
    fit: String(src.fit) === "container" ? "container" : "video",
    pages: {
      tv: pagesIn.tv === 0 || pagesIn.tv === "0" ? 0 : 1,
      player: pagesIn.player === 0 || pagesIn.player === "0" ? 0 : 1,
      mini: pagesIn.mini === 1 || pagesIn.mini === "1" ? 1 : 0,
      movie: pagesIn.movie === 1 || pagesIn.movie === "1" ? 1 : 0,
    },
    only_live: src.only_live === 1 || src.only_live === "1" ? 1 : 0,
    hide_buffering: src.hide_buffering === 0 || src.hide_buffering === "0" ? 0 : 1,
    version: Number(src.version) || 0,
  };
  if (!cfg.text) cfg.text_pos = "none";
  return cfg;
}

export const WM_POS_SET = new Set(["tl", "tr", "bl", "br", "tc", "bc", "ml", "mr", "custom"]);
export const WM_STYLE_SET = new Set(["plain", "shadow", "plate", "glass"]);
export const WM_TINT_SET = new Set(["none", "white", "black"]);
export const WM_TEXT_SET = new Set(["none", "right", "bottom", "top"]);

// ------------------------------------------------------- cache + fetch -------

let _mem = null; // { cfg, at }
let _inflight = null;

function readLs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || !j.at || Date.now() - j.at > LS_TTL_MS) return null;
    return j.cfg || null;
  } catch {
    return null;
  }
}

function writeLs(cfg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), cfg }));
  } catch {}
}

/**
 * Lấy cấu hình watermark (không bao giờ ném lỗi — mất mạng/DB chưa bật thì trả
 * cấu hình đóng gói trong app để logo vẫn hiện được).
 */
export async function fetchWatermark({ force = false } = {}) {
  if (!force && _mem && Date.now() - _mem.at < LS_TTL_MS) return _mem.cfg;
  if (!force) {
    const ls = readLs();
    if (ls) {
      _mem = { cfg: ls, at: Date.now() };
      return ls;
    }
  }
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/watermark`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      const cfg = saneConfig({ ...WM_DEFAULTS, ...(data && data.config ? data.config : {}) });
      _mem = { cfg, at: Date.now() };
      writeLs(cfg);
      return cfg;
    } catch {
      const cfg = saneConfig(WM_DEFAULTS); // offline/default: bật, góc trên phải, logo trong app
      _mem = { cfg, at: Date.now() };
      return cfg;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/** Ép nạp lại ngay (admin vừa lưu cấu hình → xem thử tại chỗ). */
export async function reloadWatermark() {
  _mem = null;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
  return fetchWatermark({ force: true });
}

/** Cho React: dùng ở player, tự nạp 1 lần rồi dùng chung. */
export function useWatermark() {
  const [cfg, setCfg] = useState(() => _mem && Date.now() - _mem.at < LS_TTL_MS ? _mem.cfg : null);
  useEffect(() => {
    let on = true;
    if (!cfg) fetchWatermark().then((c) => on && setCfg(c));
    return () => {
      on = false;
    };
  }, []); // eslint-disable-line
  return cfg;
}

// -------------------------------------------------------- resolve/position ---

/**
 * Hợp nhất cấu hình chung + tuỳ chỉnh của kênh → thông số cuối cùng để render,
 * hoặc null khi không hiện.
 *
 * @param cfg    kết quả saneConfig()/fetchWatermark()
 * @param channel kênh (có thể có `.wm` do /api/playlist trả về)
 * @param page   'tv' | 'player' | 'mini' | 'movie'
 * @param ctx    { vod, catchup, buffering }
 */
export function resolveWatermark(cfg, channel, page = "player", ctx = {}) {
  if (!cfg) return null;
  const raw = channel && channel.wm;
  const ov = raw && typeof raw === "object" ? raw : null;
  if (ov && ov.mode === "off") return null;
  if (!(ov && ov.mode === "on") && !cfg.enabled) return null;
  if (cfg.pages && cfg.pages[page] === 0) return null;
  if (cfg.only_live && (ctx.vod || ctx.catchup)) return null;

  const merged = { ...cfg, ...(ov || {}) };
  const size = clamp(merged.size, 2, 40, WM_DEFAULTS.size);
  const opacity = clamp(merged.opacity, 5, 100, WM_DEFAULTS.opacity) / 100;
  const margin = clamp(merged.margin, 0, 20, WM_DEFAULTS.margin);
  const pos = WM_POS_SET.has(String(merged.pos)) ? merged.pos : "tr";
  const text = String(merged.text || "").slice(0, 48);
  return {
    url: cfg.logo_url || absUrl(WM_BUNDLED_LOGO),
    pos,
    x: clamp(merged.x, 0, 100, WM_DEFAULTS.x),
    y: clamp(merged.y, 0, 100, WM_DEFAULTS.y),
    size,
    opacity,
    margin,
    style: WM_STYLE_SET.has(String(merged.style)) ? merged.style : "shadow",
    tint: WM_TINT_SET.has(String(merged.tint)) ? merged.tint : "none",
    text: text && merged.text_pos !== "none" ? text : "",
    text_pos: text ? (WM_TEXT_SET.has(String(merged.text_pos)) ? merged.text_pos : "right") : "none",
    fit: String(merged.fit) === "container" ? "container" : "video",
    version: cfg.version || 0,
  };
}

/**
 * CSS đặt hộp logo TRONG MỘT KHUNG (stage). Dùng chung cho player và khung kéo
 * trong admin để hai bên giống hệt nhau.
 * sizePct: % chiều cao khung → đặt theo `height` để tỉ lệ logo luôn đúng dù khung to/nhỏ.
 */
export function wmBoxStyle(spec, { stageHeightPx = 0 } = {}) {
  const s = {
    position: "absolute",
    height: `${spec.size}%`,
    maxHeight: "45%",
    maxWidth: "80%",
    opacity: spec.opacity,
    pointerEvents: "none",
    boxSizing: "border-box",
    transition: "opacity .18s ease",
  };
  const m = `${spec.margin}%`;
  switch (spec.pos) {
    case "tl":
      s.top = m;
      s.left = m;
      break;
    case "tr":
      s.top = m;
      s.right = m;
      break;
    case "bl":
      s.bottom = m;
      s.left = m;
      break;
    case "br":
      s.bottom = m;
      s.right = m;
      break;
    case "tc":
      s.top = m;
      s.left = "50%";
      s.transform = "translateX(-50%)";
      break;
    case "bc":
      s.bottom = m;
      s.left = "50%";
      s.transform = "translateX(-50%)";
      break;
    case "ml":
      s.top = "50%";
      s.left = m;
      s.transform = "translateY(-50%)";
      break;
    case "mr":
      s.top = "50%";
      s.right = m;
      s.transform = "translateY(-50%)";
      break;
    default: // custom: x/y là TÂM của hộp theo % khung
      s.left = `${spec.x}%`;
      s.top = `${spec.y}%`;
      s.transform = "translate(-50%, -50%)";
      break;
  }
  if (stageHeightPx) s.fontSize = `${Math.max(6, stageHeightPx * (spec.size / 100) * 0.34)}px`;
  return s;
}

/** Bộ lọc CSS cho kiểu hiển thị (viền mềm, nền mờ, hoặc đổi màu thành trắng/đen). */
export function wmFilterFor(spec) {
  const f = [];
  if (spec.tint === "white") f.push("brightness(0) invert(1)");
  else if (spec.tint === "black") f.push("brightness(0)");
  if (spec.style === "shadow") f.push("drop-shadow(0 1px 2px rgba(0,0,0,.7))", "drop-shadow(0 0 10px rgba(0,0,0,.35))");
  return f.length ? f.join(" ") : "none";
}

/** Nền đặt sau logo (kiểu plate/glass). plain/shadow = trong suốt. */
export function wmPlateStyle(spec) {
  if (spec.style === "plate") {
    return { background: "rgba(0,0,0,.42)", borderRadius: "0.5em", padding: "0.3em 0.45em" };
  }
  if (spec.style === "glass") {
    return {
      background: "rgba(8,9,14,.34)",
      backdropFilter: "blur(7px) saturate(120%)",
      WebkitBackdropFilter: "blur(7px) saturate(120%)",
      border: "1px solid rgba(255,255,255,.14)",
      borderRadius: "0.6em",
      padding: "0.28em 0.42em",
    };
  }
  return {};
}

/**
 * Kéo thả trong khung → quyết định bám góc nào hay về custom.
 * Ngưỡng hít góc: tâm hộp cách góc dưới 18% theo cả hai trục.
 */
export function wmSnapFromCenter(cx, cy, margin = WM_DEFAULTS.margin) {
  const near = (v, t) => Math.abs(v - t) <= 18;
  const L = margin, R = 100 - margin, T = margin, B = 100 - margin;
  if (near(cx, L) && near(cy, T)) return { pos: "tl", x: cx, y: cy };
  if (near(cx, R) && near(cy, T)) return { pos: "tr", x: cx, y: cy };
  if (near(cx, L) && near(cy, B)) return { pos: "bl", x: cx, y: cy };
  if (near(cx, R) && near(cy, B)) return { pos: "br", x: cx, y: cy };
  if (near(cy, T) && Math.abs(cx - 50) <= 14) return { pos: "tc", x: cx, y: cy };
  if (near(cy, B) && Math.abs(cx - 50) <= 14) return { pos: "bc", x: cx, y: cy };
  if (near(cx, L) && Math.abs(cy - 50) <= 14) return { pos: "ml", x: cx, y: cy };
  if (near(cx, R) && Math.abs(cy - 50) <= 14) return { pos: "mr", x: cx, y: cy };
  return { pos: "custom", x: cx, y: cy };
}

export const WM_POS_LABEL = {
  tl: "Trên · trái",
  tc: "Trên · giữa",
  tr: "Trên · phải",
  ml: "Giữa · trái",
  mr: "Giữa · phải",
  bl: "Dưới · trái",
  bc: "Dưới · giữa",
  br: "Dưới · phải",
  custom: "Tự do (kéo)",
};
