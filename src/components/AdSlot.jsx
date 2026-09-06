import React, { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';
import { fetchAds } from '../services/social';

// Khe quảng cáo do admin quản lý (slot: banner | home | movies | sports)
export default function AdSlot({ slot = 'banner', className = '' }) {
  const [ads, setAds] = useState([]);
  const [idx, setIdx] = useState(0);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let on = true;
    fetchAds(slot).then(a => { if (on) setAds(a || []); }).catch(() => {});
    return () => { on = false; };
  }, [slot]);

  useEffect(() => {
    if (ads.length < 2) return undefined;
    const iv = setInterval(() => setIdx(i => (i + 1) % ads.length), 8000);
    return () => clearInterval(iv);
  }, [ads.length]);

  if (closed || ads.length === 0) return null;
  const ad = ads[idx % ads.length];
  const inner = ad.video_url ? (
    <video src={ad.video_url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
  ) : ad.image_url ? (
    <img src={ad.image_url} alt={ad.title || ''} className="w-full h-full object-cover" loading="lazy" />
  ) : (
    <span className="flex items-center gap-2 text-[12px] font-bold text-stone-300"><Megaphone className="w-4 h-4" />{ad.title}</span>
  );
  const body = (
    <span className="relative block w-full h-full min-h-[64px] max-h-[180px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      {inner}
      {ad.title && (ad.image_url || ad.video_url) && (
        <span className="absolute bottom-0 inset-x-0 px-3 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-[11px] font-bold text-white text-left truncate">{ad.title}</span>
      )}
      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-[8px] font-black uppercase tracking-widest text-stone-400">QC</span>
    </span>
  );
  return (
    <div className={`relative ${className}`}>
      {ad.link_url ? <a href={ad.link_url} target="_blank" rel="noopener noreferrer" className="block">{body}</a> : body}
      <button onClick={() => setClosed(true)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-stone-400 hover:text-white z-10">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
