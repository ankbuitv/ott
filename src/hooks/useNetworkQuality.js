// (13) Theo dõi chất lượng mạng: cảnh báo khi rời Wi-Fi sang 4G và tự hạ chất
// lượng khi mạng yếu. Dùng Network Information API (Chrome/Android/WebView —
// tức là gần như toàn bộ người dùng app), Safari/iOS thì trả về "unknown" và
// mọi thứ hoạt động như cũ.
import { useEffect, useState, useRef } from 'react';

function read() {
  const c = (typeof navigator !== 'undefined' && (navigator.connection || navigator.mozConnection || navigator.webkitConnection)) || null;
  if (!c) return { supported: false, type: 'unknown', effectiveType: '4g', downlink: 0, saveData: false, cellular: false, slow: false };
  const type = c.type || 'unknown';
  const effectiveType = c.effectiveType || '4g';
  const cellular = type === 'cellular';
  const slow = ['slow-2g', '2g', '3g'].includes(effectiveType) || (c.downlink > 0 && c.downlink < 1.5);
  return { supported: true, type, effectiveType, downlink: c.downlink || 0, saveData: !!c.saveData, cellular, slow };
}

/**
 * @param {(info) => void} onSwitchToCellular gọi khi người dùng vừa rời Wi-Fi sang 4G/5G
 */
export default function useNetworkQuality(onSwitchToCellular) {
  const [info, setInfo] = useState(read);
  const prevType = useRef(info.type);
  const cb = useRef(onSwitchToCellular);
  cb.current = onSwitchToCellular;

  useEffect(() => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c || !c.addEventListener) return;
    const onChange = () => {
      const next = read();
      setInfo(next);
      if (prevType.current === 'wifi' && next.cellular && cb.current) cb.current(next);
      prevType.current = next.type;
    };
    c.addEventListener('change', onChange);
    return () => c.removeEventListener('change', onChange);
  }, []);

  return info;
}

/**
 * Trần độ phân giải nên dùng (chiều cao pixel, 0 = không giới hạn).
 * Ưu tiên: người dùng bật "Tiết kiệm dữ liệu" -> đúng mức họ chọn.
 * Nếu không, mà đang 4G hoặc mạng yếu và họ để bật tự động -> 480p.
 */
export function heightCapFor(info, settings = {}) {
  if (settings.dataSaver) return settings.dataSaverCap || 480;
  if (settings.autoQualityOnCellular === false) return 0;
  if (!info || !info.supported) return 0;
  if (info.saveData || info.effectiveType === 'slow-2g' || info.effectiveType === '2g') return 240;
  if (info.slow) return 360;
  if (info.cellular) return 480;
  return 0;
}
