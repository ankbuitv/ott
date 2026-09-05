/* CHRTV template guard: cấm F12/devtools + chuột phải; F12 => trang dừng */
(function () {
  var killed = false;
  function killAll() {
    if (killed) return; killed = true;
    try { document.querySelectorAll('video').forEach(function (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }); } catch (e) {}
    try { window.stop(); } catch (e) {}
    try {
      var d = document, b = d.body;
      var box = d.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;color:#f36f21;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial;text-align:center;padding:24px';
      box.innerHTML = '<div style="font-size:54px;margin-bottom:14px">🔒</div><div style="font-size:20px;font-weight:800;color:#fff">Trang đã bị dừng</div><div style="font-size:13px;color:#9b9ba3;margin-top:8px;max-width:420px">Phát hiện DevTools — nội dung được bảo vệ.<br>Đóng DevTools rồi F5 để xem lại.</div><div style="font-size:12px;color:#666;margin-top:18px">Hỗ trợ: support@ankb.qzz.io</div>';
      b.appendChild(box);
    } catch (e) {}
  }
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (e.key === 'F12' || e.code === 'F12' || e.keyCode === 123) { e.preventDefault(); killAll(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) { e.preventDefault(); killAll(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'u') { e.preventDefault(); killAll(); return; }
  }, true);
  var dpr0 = window.devicePixelRatio || 1;
  setInterval(function () {
    try {
      var z = (window.devicePixelRatio || 1) / (dpr0 || 1) || 1;
      if (window.outerWidth - window.innerWidth * z > 220 || window.outerHeight - window.innerHeight * z > 220) killAll();
    } catch (e) {}
  }, 1200);
})();
