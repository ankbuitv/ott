import React, { useState, useEffect, useCallback } from 'react';
import { X, Radio, Globe, Clock, Heart, Play, Tv, Star } from 'lucide-react';
import { formatTimeHHMM } from '../utils/dateUtils';
import { getRating, postRating } from '../services/ratings';
import { hasUserToken } from '../services/session';
import { useI18n } from '../contexts/I18nContext';

function ChannelRating({ channelId, onRequireLogin }) {
  const { t } = useI18n();
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [mine, setMine] = useState(0);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const logged = hasUserToken();

  useEffect(() => {
    let alive = true;
    if (!logged) return undefined;
    getRating(channelId).then((r) => {
      if (!alive) return;
      setAvg(r.avg || 0); setCount(r.count || 0); setMine(r.userRating || 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [channelId, logged]);

  const rate = useCallback(async (v) => {
    if (!logged) {
      if (onRequireLogin) onRequireLogin(t('chinfo.need_login'));
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await postRating(channelId, v);
      const r = await getRating(channelId);
      setAvg(r.avg || 0); setCount(r.count || 0); setMine(r.userRating || v);
    } catch (e) {
      if (e?.code === 'LOGIN_REQUIRED' && onRequireLogin) onRequireLogin(t('chinfo.need_login'));
    }
    setBusy(false);
  }, [channelId, logged, busy, onRequireLogin]);

  return (
    <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/30">
      <div className="text-[10px] text-slate-500 font-semibold uppercase mb-1 flex items-center gap-1">
        <Star className="w-3 h-3" /> {t('chinfo.rate')}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              onClick={() => rate(v)}
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5 transition-transform hover:scale-125"
              title={`${v} sao`}
            >
              <Star className={`w-5 h-5 ${(hover || mine) >= v ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-400 ml-1">
          {count > 0 ? t('chinfo.rated', { avg: Number(avg || 0).toFixed(1), n: count }) : (logged ? t('chinfo.first') : t('chinfo.login_to_rate'))}
        </span>
      </div>
    </div>
  );
}

export default function ChannelInfoModal({ channel, epgNow, epgNext, isFavorite, onPlay, onToggleFavorite, onClose, onRequireLogin }) {
  const { t } = useI18n();
  if (!channel) return null;
  return (
    <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden modal-panel" onClick={e => e.stopPropagation()}>
        <div className="relative p-5 pt-6 text-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(280px 130px at 50% 0%, rgba(243,111,33,.22), transparent 70%)' }}></div>
          <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-slate-800 rounded-lg">
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <img
            src={channel.logo || 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'}
            alt={channel.name}
            className="w-20 h-20 object-contain mx-auto rounded-2xl bg-slate-900 p-2 border border-slate-800/50 mb-3"
            onError={e => { e.target.style.display = 'none'; }}
          />

          <h2 className="text-lg font-extrabold text-white mb-1">{channel.name}</h2>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="px-2.5 py-1 text-[10px] font-bold rounded-full grad-brand text-white shadow-md shadow-[#f36f21]/30">{channel.group_title || t('chinfo.general')}</span>
            {epgNow && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600/80 text-white flex items-center gap-0.5">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
              </span>
            )}
          </div>
        </div>

        <div className="px-5 pb-3 space-y-2.5">
          {epgNow && (
            <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/30">
              <div className="text-[10px] text-[#ff9a3d] font-semibold uppercase mb-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t('chinfo.now')}
              </div>
              <p className="text-xs font-bold text-white truncate">{epgNow.title}</p>
              <p className="text-[10px] text-slate-500">{formatTimeHHMM(epgNow.start)} - {formatTimeHHMM(epgNow.stop)}</p>
            </div>
          )}
          {epgNext && (
            <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800/20">
              <div className="text-[10px] text-slate-500 font-semibold uppercase mb-0.5">{t('chinfo.next')}</div>
              <p className="text-xs font-medium text-slate-300 truncate">{epgNext.title}</p>
              <p className="text-[10px] text-slate-600">{formatTimeHHMM(epgNext.start)}</p>
            </div>
          )}

          <ChannelRating channelId={channel.channel_id} onRequireLogin={onRequireLogin} />

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1"><Globe className="w-3 h-3" /> ID</span>
              <span className="text-slate-300 font-mono text-[10px]">{channel.channel_id}</span>
            </div>
            {channel.catchup_type && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Catchup</span>
                <span className="text-slate-300 text-[10px]">{channel.catchup_type} ({t('chinfo.n_days', { n: channel.catchup_days || 7 })})</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={() => { onToggleFavorite(channel.channel_id); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              isFavorite ? 'bg-[#f36f21]/20 text-[#ff9a3d] border border-[#f36f21]/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-[#f36f21]' : ''}`} />
            {isFavorite ? t('chinfo.unlike') : t('chinfo.like')}
          </button>
          <button
            onClick={() => { onPlay(channel); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-[#f36f21] text-white hover:bg-[#f36f21] transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Xem ngay
          </button>
        </div>
      </div>
    </div>
  );
}
