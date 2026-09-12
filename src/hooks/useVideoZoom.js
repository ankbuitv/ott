import { useCallback, useEffect, useState } from "react";

/**
 * Chế độ "phóng to" của player (xem Truyền hình / cửa sổ player):
 *   fit     — Vừa khung: giữ nguyên tỉ lệ, hết khung thì có viền đen (mặc định)
 *   fill    — Phóng to: lấp đầy khung, cắt mép thừa (4:3 trên màn 16:9 hết viền)
 *   stretch — Kéo giãn: lấp hết khung, chấp nhận méo hình
 * Lưu ở localStorage nên mở kênh sau vẫn giữ lựa chọn.
 */
export const ZOOM_MODES = [
  { id: "fit", label: "Vừa khung", cls: "object-contain" },
  { id: "fill", label: "Phóng to", cls: "object-cover" },
  { id: "stretch", label: "Kéo giãn", cls: "object-fill" },
];
const STORAGE_KEY = "chrtv_zoom_mode";

export default function useVideoZoom() {
  const [mode, setMode] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return ZOOM_MODES.some((m) => m.id === v) ? v : "fit";
    } catch {
      return "fit";
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((cur) => {
      const i = ZOOM_MODES.findIndex((m) => m.id === cur);
      return ZOOM_MODES[(i + 1) % ZOOM_MODES.length].id;
    });
  }, []);

  const cur = ZOOM_MODES.find((m) => m.id === mode) || ZOOM_MODES[0];
  return { mode, cycle, label: cur.label, cls: cur.cls };
}
