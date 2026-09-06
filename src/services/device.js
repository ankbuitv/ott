/**
 * Thông tin thiết bị + fingerprint (mục Cài đặt → Giới thiệu)
 * Thuần client, không gửi gì đi đâu.
 */

function ua() {
  try { return navigator.userAgent || ''; } catch { return ''; }
}

// Trình duyệt + version từ UA
export function getBrowser() {
  const s = ua();
  let m;
  // Edge / Opera / Samsung / CocCoc / Chrome / Safari / Firefox
  if ((m = /EdgA?\/(\d+)/.exec(s))) return { name: 'Edge', version: m[1] };
  if ((m = /OPR\/(\d+)/.exec(s))) return { name: 'Opera', version: m[1] };
  if ((m = /SamsungBrowser\/(\d+)/.exec(s))) return { name: 'Samsung Internet', version: m[1] };
  if ((m = /CocCoc\/(\d+)/.exec(s))) return { name: 'Cốc Cốc', version: m[1] };
  if ((m = /Firefox\/(\d+)/.exec(s))) return { name: 'Firefox', version: m[1] };
  if ((m = /CriOS\/(\d+)/.exec(s))) return { name: 'Chrome iOS', version: m[1] };
  if ((m = /FxiOS\/(\d+)/.exec(s))) return { name: 'Firefox iOS', version: m[1] };
  if (/Chrome\//.test(s) && !/Chromium\//.test(s)) {
    m = /Chrome\/(\d+)/.exec(s);
    return { name: 'Chrome', version: m ? m[1] : '' };
  }
  if ((m = /Chromium\/(\d+)/.exec(s))) return { name: 'Chromium', version: m[1] };
  if ((m = /Version\/([\d.]+).*Safari\//.exec(s))) return { name: 'Safari', version: m[1].split('.')[0] };
  if ((m = /Safari\/(\d+)/.exec(s))) return { name: 'Safari', version: '' };
  return { name: 'Trình duyệt web', version: '' };
}

// HĐH + version
export function getOS() {
  const s = ua();
  let m;
  if ((m = /Android\s+([\d.]+)/.exec(s))) return { name: 'Android', version: m[1] };
  if ((m = /Windows NT ([\d.]+)/.exec(s))) {
    const v = m[1];
    const label = v.startsWith('10') ? '10 / 11' : v;
    return { name: 'Windows', version: label };
  }
  if ((m = /iPhone OS ([\d_]+)/.exec(s)) || (m = /CPU (?:iPhone )?OS ([\d_]+)/.exec(s)))
    return { name: 'iOS', version: m[1].replace(/_/g, '.') };
  if ((m = /Mac OS X ([\d_]+)/.exec(s))) return { name: 'macOS', version: m[1].replace(/_/g, '.') };
  if (/Linux/.test(s)) return { name: 'Linux', version: '' };
  if (/CrOS/.test(s)) return { name: 'ChromeOS', version: '' };
  return { name: 'Không rõ', version: '' };
}

// Loại thiết bị
export function getDeviceKind() {
  const s = ua();
  if (/Android TV|SmartTV|GoogleTV|webOS|Tizen|Roku|Chromecast|MI TV|Xiaomi TV|AmazonFire/i.test(s)) return 'tv';
  try {
    const w = window.innerWidth;
    if (/iPad|Tablet/i.test(s)) return 'tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(s)) return w < 768 ? 'phone' : 'tablet';
  } catch {}
  return 'desktop';
}

// Hash FNV-1a (fallback đồng bộ)
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// Canvas fingerprint (vẽ ẩn, hash pixel)
function canvasSig() {
  try {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#f36f21';
    x.font = '16px Arial';
    x.fillText('CHRTV 🎬⚽📺', 8, 26);
    x.strokeStyle = '#42a5f5';
    x.strokeRect(4, 4, 192, 32);
    return c.toDataURL().slice(-64);
  } catch { return 'nocanvas'; }
}

// Chuỗi thô làm fingerprint
export function fingerprintSource() {
  const parts = [];
  try {
    parts.push(ua());
    parts.push(navigator.language || '');
    parts.push(String(screen.width) + 'x' + screen.height + 'x' + (screen.colorDepth || ''));
    parts.push(String(new Date().getTimezoneOffset()));
    try { parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch {}
    parts.push(String(navigator.hardwareConcurrency || ''));
    parts.push(String(navigator.maxTouchPoints || ''));
    parts.push(canvasSig());
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      parts.push(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : 'nogl');
    } catch { parts.push('nogl'); }
  } catch {}
  return parts.join('|');
}

// Fingerprint SHA-256 (rút gọn 16 ký tự) — async, có fallback sync
export async function getFingerprint() {
  const src = fingerprintSource();
  try {
    if (window.crypto?.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16).toUpperCase();
    }
  } catch {}
  return (fnv1a(src) + fnv1a(src.split('').reverse().join(''))).toUpperCase();
}

// Gom toàn bộ info hiển thị ở About
export async function getDeviceInfo() {
  const b = getBrowser();
  const os = getOS();
  let screenStr = '', vp = '', lang = '', tz = '', online = true, standalone = false, cores = 0;
  try { screenStr = `${screen.width}×${screen.height}`; } catch {}
  try { vp = `${window.innerWidth}×${window.innerHeight}`; } catch {}
  try { lang = navigator.language || ''; } catch {}
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  try { online = navigator.onLine !== false; } catch {}
  try { standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true; } catch {}
  try { cores = navigator.hardwareConcurrency || 0; } catch {}
  const fp = await getFingerprint();
  return {
    browser: b.version ? `${b.name} ${b.version}` : b.name,
    os: os.version ? `${os.name} ${os.version}` : os.name,
    kind: getDeviceKind(),
    screen: screenStr, viewport: vp, lang, tz, online, standalone, cores,
    ua: ua().slice(0, 220),
    fingerprint: fp,
  };
}
