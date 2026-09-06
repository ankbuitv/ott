// (34) Màn quảng cáo pre-roll — hiện trước khi mở kênh/phim.
// Bỏ qua được sau `skipAfter` giây (theo gói): ultimate 5s · recreational 10s · standard 30s.
import React, { useEffect, useRef, useState } from 'react';
import { SkipForward, Crown, ExternalLink } from 'lucide-react';
import { reportAdImpression } from '../services/ads';

export default function PrerollAd({ ad, skipAfter = 30, refId = '', onDone, onUpgrade }) {
  const [left, setLeft] = useState(Math.max(0, skipAfter));
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(e => e + 1);
      setLeft(l => Math.max(0, l - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const finish = (completed) => {
    if (doneRef.current) return;
    doneRef.current = true;
    reportAdImpression({ ad_id: ad?.id, ref_id: refId, completed, seconds: elapsed });
    onDone?.();
  };

  // Video quảng cáo chạy hết thì vào kênh luôn
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onEnd = () => finish(true);
    v.addEventListener('ended', onEnd);
    return () => v.removeEventListener('ended', onEnd);
  }, []); // eslint-disable-line

  // Ảnh tĩnh: tự đóng sau khi hết thời gian bắt buộc + 3 giây
  useEffect(() => {
    if (ad?.video_url) return undefined;
    const tm = setTimeout(() => finish(true), (Math.max(0, skipAfter) + 3) * 1000);
    return () => clearTimeout(tm);
  }, []); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {ad?.video_url ? (
          <video ref={videoRef} src={ad.video_url} autoPlay playsInline className="w-full h-full object-contain" />
        ) : ad?.image_url ? (
          <img src={ad.image_url} alt={ad.title || 'Quảng cáo'} className="w-full h-full object-contain" />
        ) : (
          <div className="text-center px-8">
            <p className="text-2xl font-black text-white">{ad?.title || 'Quảng cáo'}</p>
          </div>
        )}

        <span className="absolute top-4 left-4 px-2 py-1 rounded-md bg-black/70 border border-white/15 text-[10px] font-black tracking-widest text-amber-300">
          QUẢNG CÁO
        </span>

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {left > 0 ? (
            <span className="px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-[12px] font-bold text-white">
              Bỏ qua sau {left}s
            </span>
          ) : (
            <button
              onClick={() => finish(false)}
              className="px-4 py-2 rounded-xl bg-white text-black text-[12px] font-black flex items-center gap-1.5 hover:bg-stone-200"
            >
              Bỏ qua <SkipForward className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {ad?.link_url && (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-[#f36f21] text-white text-[13px] font-black flex items-center gap-2"
          >
            {ad.title || 'Tìm hiểu thêm'} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="px-5 py-4 bg-[#0b0c10] border-t border-white/[0.07] flex items-center gap-3">
        <p className="text-[11px] text-stone-500 flex-1">
          Quảng cáo giúp CHRTV PLAY duy trì máy chủ. Tối đa 5 lần mỗi giờ.
        </p>
        <button
          onClick={() => { onUpgrade?.(); finish(false); }}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#f36f21] to-[#fbbf24] text-black text-[12px] font-black flex items-center gap-1.5 shrink-0"
        >
          <Crown className="w-3.5 h-3.5" /> Nâng gói — xem không quảng cáo
        </button>
      </div>
    </div>
  );
}
