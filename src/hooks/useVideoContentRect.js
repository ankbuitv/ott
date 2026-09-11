import { useEffect, useState } from "react";

/**
 * Tính hộp chữ nhật mà khung hình video THỰC SỰ chiếm bên trong container.
 *
 * Player dùng `object-contain`: khi video 16:9 đặt trong khung 21:9 (chế độ rạp
 * hát) hoặc khung dọc trên điện thoại thì sẽ có dải đen (letterbox). Logo watermark
 * muốn bám vào GÓC ẢNH thì phải tính theo hộp này, không phải theo container —
 * nếu không logo sẽ rơi tõm vào dải đen trông rất bẩn.
 *
 * @param containerRef ref tới div chứa <video>
 * @returns {left, top, width, height} (px, hệ toạ độ container) hoặc null
 */
export function useVideoContentRect(containerRef, enabled = true) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const el = containerRef && containerRef.current;
    if (!el || !enabled) {
      setRect(null);
      return;
    }
    let raf = 0;
    let alive = true;
    const apply = () => {
      if (!alive) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const v = el.querySelector("video");
      const vw = v && v.videoWidth ? v.videoWidth : 0;
      const vh = v && v.videoHeight ? v.videoHeight : 0;
      let next = { left: 0, top: 0, width: cw, height: ch };
      if (vw && vh) {
        const s = Math.min(cw / vw, ch / vh); // contain = tỉ lệ co theo cạnh bị thắt
        const w = vw * s;
        const h = vh * s;
        next = { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
      }
      setRect((prev) => {
        if (prev && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5 &&
            Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5) return prev;
        return next;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    const video = el.querySelector("video");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    try { ro && ro.observe(el); } catch {}
    const evs = ["resize", "loadedmetadata", "playing", "enterpictureinpicture", "leavepictureinpicture"];
    if (video) evs.forEach((e) => video.addEventListener(e, schedule));
    window.addEventListener("resize", schedule);
    // Đổi fullscreen (kể cả F11 của trình duyệt) làm đổi hộp ảnh ngay lập tức
    const fs = () => schedule();
    document.addEventListener("fullscreenchange", fs);
    document.addEventListener("webkitfullscreenchange", fs);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      try { ro && ro.disconnect(); } catch {}
      if (video) evs.forEach((e) => video.removeEventListener(e, schedule));
      window.removeEventListener("resize", schedule);
      document.removeEventListener("fullscreenchange", fs);
      document.removeEventListener("webkitfullscreenchange", fs);
    };
  }, [containerRef, enabled]);

  return rect;
}
