import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWatermark, resolveWatermark, wmBoxStyle, wmFilterFor, wmPlateStyle } from '../services/watermark';
import { useVideoContentRect } from '../hooks/useVideoContentRect';

/**
 * Logo watermark của web đắp lên khung hình đang phát.
 *
 * - Không chặn thao tác: `pointer-events: none` trên toàn lớp.
 * - Bám góc ẢNH (không rơi vào dải letterbox) khi cấu hình `fit = video`.
 * - Cấu hình lấy từ /api/watermark, kênh nào có `channel.wm` thì theo kênh
 *   (kể cả `mode: 'off'` để tắt riêng kênh đó). Admin chỉnh ở tab <i>Logo khi phát</i> trong Admin Panel.
 *
 * Dùng: <StreamWatermark channel={channel} page="player" containerRef={ref} buffering={buffering} />
 */
export default function StreamWatermark({
  channel,
  page = 'player',
  containerRef,
  buffering = false,
  vod = false,
  catchup = false,
  z = 12,
  className = '',
}) {
  const cfg = useWatermark();
  const spec = useMemo(
    () => resolveWatermark(cfg, channel, page, { vod, catchup }),
    [cfg, channel, page, vod, catchup]
  );
  const rect = useVideoContentRect(containerRef, !!spec);
  const [broken, setBroken] = useState(false);
  const [shown, setShown] = useState(false);
  const url = spec && spec.url;
  useEffect(() => setBroken(false), [url]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const boxRef = useRef(null);
  // Cỡ chữ của dòng mô tả tính theo chiều cao khung hình (em không tự co theo % được)
  const stageH = (rect && rect.height) || (containerRef && containerRef.current && containerRef.current.clientHeight) || 0;
  useEffect(() => {
    if (!boxRef.current || !spec || !stageH) return;
    const fs = Math.max(7, Math.min(30, stageH * (spec.size / 100) * 0.34));
    boxRef.current.style.fontSize = `${fs}px`;
  }, [spec, stageH]);

  if (!spec || broken) return null;

  const hidden = !!buffering && !!cfg.hide_buffering;
  const useVideoFit = spec.fit === 'video' && rect;
  const stage = useVideoFit
    ? { position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : { position: 'absolute', inset: 0 };

  const boxStyle = wmBoxStyle(spec);
  const plate = wmPlateStyle(spec);
  const dir = spec.text_pos === 'bottom' ? 'column' : spec.text_pos === 'top' ? 'column-reverse' : 'row';
  const isRow = dir === 'row';

  return (
    <div
      aria-hidden="true"
      className={`chrtv-wm-layer pointer-events-none select-none overflow-visible ${className}`}
      style={{ ...stage, zIndex: z, opacity: hidden || !shown ? 0 : 1, transform: shown ? 'none' : 'translateY(-2px)', transition: 'opacity .3s ease, transform .3s ease' }}
    >
      <div
        ref={boxRef}
        style={{
          ...boxStyle,
          ...plate,
          display: 'flex',
          flexDirection: dir,
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: spec.text ? '0.45em' : 0,
        }}
      >
        <img
          src={spec.url}
          alt=""
          draggable="false"
          onError={() => setBroken(true)}
          style={{
            display: 'block',
            // Hàng (mô tả bên phải): logo chiếm hết chiều cao hộp.
            // Cột (mô tả dưới/trên): chừa chỗ cho dòng chữ.
            height: isRow ? '100%' : '58%',
            width: 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            WebkitUserDrag: 'none',
            userSelect: 'none',
            filter: wmFilterFor(spec),
          }}
        />
        {spec.text && (
          <span
            style={{
              color: '#fff',
              fontWeight: 800,
              letterSpacing: '0.06em',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              textShadow: '0 1px 3px rgba(0,0,0,.75), 0 0 10px rgba(0,0,0,.4)',
              filter: spec.tint === 'black' ? 'invert(1)' : 'none',
            }}
          >
            {spec.text}
          </span>
        )}
      </div>
    </div>
  );
}
