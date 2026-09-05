import React, { useMemo, useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Play, Star } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { MovieAPI, imgPath } from '../services/tmdb';
import { findEpgForChannel } from '../utils/epgMatch';

/**
 * SHORTS (mytv style) — video ngang dọc (9:16), lướt ngang snap:
 *  - Hàng 1: chương trình ĐANG PHÁT trên kênh (logo + EPG now) → bấm xem kênh
 *  - Hàng 2: phim/series thịnh hành (TMDB) → bấm mở player phim
 */
const GRADS = [
  'linear-gradient(150deg,#f36f21,#7a2f0e)',
  'linear-gradient(150deg,#0b2a5e,#14418f)',
  'linear-gradient(150deg,#2e7d32,#0a1f0c)',
  'linear-gradient(150deg,#6a1b9a,#12052e)',
  'linear-gradient(150deg,#c62828,#3e0707)',
  'linear-gradient(150deg,#00695c,#02201b)',
  'linear-gradient(150deg,#4527a0,#14052e)',
  'linear-gradient(150deg,#880e4f,#200510)',
];

function ShortCard({ art, badge, caption, sub, acts, shareLabel, onClick, index, title }) {
  return (
    <button
      onClick={onClick}
      className="short mytv-card shrink-0 rounded-2xl relative overflow-hidden cursor-pointer group text-left anim-fade-up"
      style={{ width: 'min(300px, 72vw)', aspectRatio: '9/16.2', scrollSnapAlign: 'center', animationDelay: `${Math.min(index, 8) * 60}ms` }}
      title={title}
    >
      {typeof art === 'string' && art.startsWith('http') ? (
        <img src={art} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
      ) : (
        <div className="absolute inset-0" style={{ background: art || GRADS[index % GRADS.length] }}></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30"></div>

      {badge && (
        <span className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-[2px] text-[10px] font-extrabold px-2.5 py-1 rounded-md flex items-center gap-1.5">
          <span className="eq"><i></i><i></i><i></i></span> {badge}
        </span>
      )}

      {/* Nút play khi hover */}
      <span className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="w-14 h-14 rounded-full bg-black/45 border-2 border-white/85 flex items-center justify-center text-white text-xl pl-1 scale-90 group-hover:scale-100 transition-transform">
          ▶
        </span>
      </span>

      <div className="absolute bottom-0 inset-x-0 z-10 p-4">
        {caption && <p className="text-[14px] font-extrabold leading-snug drop-shadow mb-1.5 line-clamp-2">{caption}</p>}
        {sub && <p className="text-[11px] text-white/70 mb-3 line-clamp-1">{sub}</p>}
      </div>

      {acts && (
        <div className="absolute right-3 bottom-4 z-10 flex flex-col gap-3 items-center">
          {[Heart, MessageCircle, Share2].map((Ic, i) => (
            <span key={i} className="flex flex-col items-center gap-0.5 text-white/90">
              <Ic className="w-5 h-5" style={{ fill: i === 0 ? 'rgba(229,57,53,.85)' : 'none' }} stroke={i === 0 ? '#fff' : 'currentColor'} />
              <small className="text-[9.5px] font-bold">{i === 0 ? '12K' : i === 1 ? '356' : shareLabel}</small>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function ShortsScreen({ channels, epgData, onSelectChannel, onSelectMovie }) {
  const { t } = useI18n();
  const [trending, setTrending] = useState([]);

  useEffect(() => {
    let alive = true;
    MovieAPI.trending().then(r => {
      if (!alive) return;
      const list = (r?.results || [])
        .filter(m => m.poster_path)
        .slice(0, 10);
      setTrending(list);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Kênh đang phát (có EPG "now") — lấy 8 kênh đầu có logo/EPG
  const liveShorts = useMemo(() => {
    if (!channels?.length) return [];
    const nowTs = Date.now();
    return channels
      .map(ch => ({ ch, epg: findEpgForChannel(epgData?.programmes || [], ch) }))
      .filter(x => x.epg?.now)
      .slice(0, 8);
  }, [channels, epgData]);

  return (
    <div className="pb-10">
      {/* Tiêu đề */}
      <div className="px-5 md:px-8 pt-6 pb-2 anim-fade-up">
        <h2 className="text-2xl font-black text-white tracking-tight">{t('shorts.title')}</h2>
        <p className="text-[12px] text-[#9b9ba3] mt-0.5">{t('shorts.sub')}</p>
      </div>

      {/* Hàng 1: kênh đang phát */}
      {liveShorts.length > 0 && (
        <div className="flex gap-4 overflow-x-auto scrollbar-none px-5 md:px-8 py-4" style={{ scrollSnapType: 'x mandatory' }}>
          {liveShorts.map(({ ch, epg }, i) => (
            <ShortCard
              key={ch.channel_id}
              index={i}
              art={ch.logo ? null : GRADS[i % GRADS.length]}
              badge={t('player.live')}
              caption={ch.name}
              sub={`${t('shorts.live_now')} ${ch.name} · ${epg.now.title}`}
              acts
              shareLabel={t('shorts.share')}
              title={ch.name}
              onClick={() => onSelectChannel && onSelectChannel(ch)}
            >
            </ShortCard>
          ))}
        </div>
      )}

      {/* Hàng 2: phim thịnh hành */}
      {trending.length > 0 && (
        <>
          <h3 className="px-5 md:px-8 pt-4 pb-1 text-[15px] font-extrabold text-white anim-fade-up">{t('shorts.trending')}</h3>
          <div className="flex gap-4 overflow-x-auto scrollbar-none px-5 md:px-8 py-4" style={{ scrollSnapType: 'x mandatory' }}>
            {trending.map((m, i) => (
              <ShortCard
                key={`${m.media_type}-${m.id}`}
                index={i}
                art={imgPath(m.poster_path, 'w500')}
                caption={m.title || m.name}
                sub={`${m.media_type === 'tv' ? 'Series' : 'Phim'}${m.vote_average ? ` · ★ ${Number(m.vote_average).toFixed(1)}` : ''}${m.release_date ? ` · ${String(m.release_date).slice(0, 4)}` : ''}`}
                acts
                shareLabel={t('shorts.share')}
                title={m.title || m.name}
                onClick={() => onSelectMovie && onSelectMovie(m)}
              />
            ))}
          </div>
        </>
      )}

      {/* Trạng thái rỗng */}
      {liveShorts.length === 0 && trending.length === 0 && (
        <div className="px-5 md:px-8 py-16 text-center">
          <p className="text-4xl mb-3">🎬</p>
          <p className="text-sm text-[#9b9ba3]">{t('app.loading')}</p>
        </div>
      )}
    </div>
  );
}
