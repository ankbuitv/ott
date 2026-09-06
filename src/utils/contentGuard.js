/**
 * Chặn thao tác lấy dữ liệu trên web: chuột phải, F12, xem nguồn, lưu trang.
 * Charles / proxy hệ thống không chặn được từ trình duyệt — khi phát hiện
 * DevTools thì dừng phát để hạn chế rip link.
 */

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(el) {
  if (!el) return false;
  const n = el.tagName;
  return TYPING.has(n) || !!el.isContentEditable;
}

function isHotkey(e) {
  const k = e.key;
  const code = e.code;
  const ctrl = e.ctrlKey || e.metaKey;
  if (k === 'F12' || code === 'F12') return true;
  if (ctrl && e.shiftKey && /^(I|J|C|K)$/i.test(k)) return true;
  if (ctrl && !e.shiftKey && /^(U|S|P)$/i.test(k)) return true;
  if (e.metaKey && e.altKey && /^(I|J|C|U)$/i.test(k)) return true;
  return false;
}

function pauseMedia() {
  try {
    document.querySelectorAll('video, audio').forEach((el) => {
      try { el.pause(); } catch {}
    });
  } catch {}
}

let overlayEl = null;
function showBlock(on) {
  if (on) {
    pauseMedia();
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.setAttribute('data-chrtv-guard', '1');
      overlayEl.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#07080c;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;font-family:Inter,system-ui,sans-serif;';
      overlayEl.innerHTML = '<p style="color:#fff;font-weight:900;font-size:18px;letter-spacing:.04em">CHRTV PL▷Y</p><p style="color:#a8a29a;font-size:13px">Không hỗ trợ công cụ nhà phát triển.</p>';
      document.documentElement.appendChild(overlayEl);
    }
  } else if (overlayEl) {
    try { overlayEl.remove(); } catch {}
    overlayEl = null;
  }
}

function looksLikeDevtools() {
  try {
    if (navigator.webdriver) return true;
  } catch {}
  try {
    if (window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) return true;
  } catch {}
  try {
    if (window.self !== window.top) return false;
    const w = Math.abs((window.outerWidth || 0) - (window.innerWidth || 0));
    const h = Math.abs((window.outerHeight || 0) - (window.innerHeight || 0));
    if (w > 280 || h > 280) return true;
  } catch {}
  return false;
}

export function installContentGuard() {
  if (typeof window === 'undefined') return;
  try {
    if (new URLSearchParams(window.location.search).get('chrtv_debug') === '1') return;
  } catch {}

  const block = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  document.addEventListener('contextmenu', block, true);
  document.addEventListener('dragstart', (e) => {
    if (isTypingTarget(e.target)) return;
    block(e);
  }, true);
  document.addEventListener('copy', (e) => {
    if (isTypingTarget(e.target)) return;
    block(e);
  }, true);
  document.addEventListener('cut', (e) => {
    if (isTypingTarget(e.target)) return;
    block(e);
  }, true);
  document.addEventListener('selectstart', (e) => {
    if (isTypingTarget(e.target)) return;
    block(e);
  }, true);

  window.addEventListener('keydown', (e) => {
    if (!isHotkey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    pauseMedia();
  }, true);

  let flagged = false;
  const tick = () => {
    const open = looksLikeDevtools();
    if (open !== flagged) {
      flagged = open;
      showBlock(open);
    } else if (open) {
      pauseMedia();
    }
  };
  tick();
  setInterval(tick, 1200);
  window.addEventListener('resize', tick);
}
