import React from 'react';
import { X, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../contexts/I18nContext';
import ShareButtons, { buildDeepLink } from './ShareButtons';
import { imgPath } from '../services/tmdb';

export function movieDeepId(m) {
  return `${m?.media_type === 'tv' ? 'tv' : 'movie'}-${m?.id}`;
}

// Chia sẻ phim: QR mở trên điện thoại + deep link
export default function ShareMovieModal({ movie, onClose }) {
  const { t } = useI18n();
  if (!movie) return null;
  const link = buildDeepLink({ movie: movieDeepId(movie) });
  return (
    <div className="fixed inset-0 z-[220] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm modal-panel overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><QrCode className="w-4 h-4 text-[#ff9a3d]" />{t('share_movie.title')}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            {movie.poster_path && <img src={imgPath(movie.poster_path, 'w185')} alt="" className="w-12 h-[72px] object-cover rounded-lg border border-white/10" />}
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-white truncate">{movie.title || movie.name}</p>
              <p className="text-[11px] text-stone-500">{(movie.release_date || movie.first_air_date || '').slice(0, 4)}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 flex items-center justify-center">
            <QRCodeSVG value={link} size={180} level="M" includeMargin={false} />
          </div>
          <p className="text-[11px] text-stone-400 text-center flex items-center justify-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />{t('share_movie.scan')}
          </p>
          <div className="bg-black/40 border border-white/10 rounded-xl px-3 py-2">
            <p className="text-[11px] text-stone-400 truncate">{link}</p>
          </div>
          <ShareButtons url={link} title={movie.title || movie.name} />
        </div>
      </div>
    </div>
  );
}
