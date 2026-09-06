import React, { useState, useEffect, useMemo } from 'react';
import { Lock, Play, LogOut, Clock, Plus } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { discoverMovies, imgPath } from '../services/tmdb';
import { getKidLimit, getTodaySec, isOverLimit, addKidBonus, fmtDur } from '../services/kids';
import PinPad from './PinPad';

const KID_CH_RE = /cartoon|anim|kids|thiếu nhi|thieu nhi|hoạt hình|hoat hinh|disney|thiếu niên|baby/i;

// Chế độ bé: chỉ hoạt hình + kênh thiếu nhi, giới hạn giờ/ngày, thoát bằng PIN phụ huynh
export default function KidsShell({ channels = [], onSelectChannel, onSelectMovie, onExitKids }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { currentProfile, profiles, verifyPin, fetchProfiles } = useProfile();
  const { token } = useAuth();
  const [cartoons, setCartoons] = useState([]);
  const [family, setFamily] = useState([]);
  const [askPin, setAskPin] = useState(null); // 'exit' | 'bonus'
  const [pinErr, setPinErr] = useState('');
  const [todaySec, setTodaySec] = useState(0);
  const [over, setOver] = useState(false);

  const pid = currentProfile?.id || 'guest';

  useEffect(() => {
    discoverMovies({ with_genres: '16', sort_by: 'popularity.desc' }).then(r => setCartoons((r.results || []).filter(m => m.poster_path).slice(0, 18))).catch(() => {});
    discoverMovies({ with_genres: '10751', sort_by: 'popularity.desc' }).then(r => setFamily((r.results || []).filter(m => m.poster_path).slice(0, 18))).catch(() => {});
    if (token) fetchProfiles(token).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = () => {
      setTodaySec(getTodaySec(pid));
      setOver(isOverLimit(pid));
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [pid]);

  const kidChannels = useMemo(() => {
    return (channels || []).filter(ch => KID_CH_RE.test(`${ch.channel_id || ''} ${ch.name || ''} ${ch.group_title || ''}`));
  }, [channels]);

  const limit = getKidLimit(pid);

  // Thoát / cộng giờ: thử PIN các hồ sơ người lớn
  const tryParentPin = async (pin) => {
    const adults = (profiles || []).filter(p => !p.is_child);
    if (!adults.length) {
      if (askPin === 'bonus') { addKidBonus(pid, 30); addToast(t('kids.bonus_ok'), 'success'); }
      else onExitKids && onExitKids();
      setAskPin(null);
      return;
    }
    for (const a of adults) {
      try {
        const r = await verifyPin(token, a.id, pin);
        if (r?.success) {
          if (askPin === 'bonus') { addKidBonus(pid, 30); setOver(false); addToast(t('kids.bonus_ok'), 'success'); }
          else onExitKids && onExitKids();
          setAskPin(null); setPinErr('');
          return;
        }
      } catch {}
    }
    setPinErr(t('pin.wrong'));
  };

  if (over) {
    return (
      <div className="min-h-full flex items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <div className="text-6xl mb-3">😴</div>
          <h2 className="text-xl font-black text-white mb-2">{t('kids.times_up')}</h2>
          <p className="text-[13px] text-stone-400 mb-4">{t('kids.times_up_sub', { d: fmtDur(todaySec) })}</p>
          <button onClick={() => { setPinErr(''); setAskPin('bonus'); }} className="px-6 py-3 rounded-2xl grad-brand text-white text-[13px] font-bold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('kids.ask_parent')}
          </button>
          {askPin && <PinPad title={t('kids.parent_pin')} error={pinErr} onSubmit={tryParentPin} onCancel={() => { setAskPin(null); setPinErr(''); }} />}
        </div>
      </div>
    );
  }

  const Row = ({ title, emoji, items }) => (
    <section>
      <h2 className="text-[20px] font-black text-white mb-3">{emoji} {title}</h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x">
        {(items || []).map(m => (
          <button key={`${m.media_type || 'movie'}-${m.id}`} onClick={() => onSelectMovie && onSelectMovie({ ...m, media_type: m.media_type || 'movie' })} className="group shrink-0 w-[140px] md:w-[170px] snap-start active:scale-[0.98] transition-transform">
            <span className="block aspect-[2/3] rounded-3xl overflow-hidden bg-stone-900 border-2 border-white/10 group-hover:border-amber-400/70 shadow-xl transition-all">
              <img src={imgPath(m.poster_path, 'w342')} alt={m.title || m.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
            </span>
            <span className="block text-[13px] font-bold text-white truncate mt-1.5 text-center">{m.title || m.name}</span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="text-white pb-12">
      <div className="px-5 md:px-8 pt-5 pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-4xl">🧒</span>
            <div>
              <h1 className="text-[24px] font-black tracking-tight leading-none">{t('kids.title', { name: currentProfile?.name || '' })}</h1>
              <p className="text-[11px] text-stone-500 mt-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {limit ? t('kids.today', { d: fmtDur(todaySec), lim: fmtDur(limit * 60) }) : t('kids.today_free', { d: fmtDur(todaySec) })}
              </p>
            </div>
          </div>
          <button onClick={() => { setPinErr(''); setAskPin('exit'); }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[12px] font-bold text-stone-300">
            <LogOut className="w-4 h-4" />{t('kids.exit')}
          </button>
        </div>
        {limit > 0 && (
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400 transition-all" style={{ width: `${Math.min(100, Math.round((todaySec / (limit * 60)) * 100))}%` }} />
          </div>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-5 md:px-8 space-y-8 pt-4">
        {kidChannels.length > 0 && (
          <section>
            <h2 className="text-[20px] font-black text-white mb-3">📺 {t('kids.channels')}</h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x">
              {kidChannels.map(ch => (
                <button key={ch.channel_id} onClick={() => onSelectChannel && onSelectChannel(ch)} className="group shrink-0 w-[170px] snap-start rounded-3xl overflow-hidden border-2 border-white/10 hover:border-amber-400/70 bg-[#15161b] transition-all">
                  <span className="block h-[100px] flex items-center justify-center bg-[#0c0d11] relative">
                    {ch.logo ? <img src={ch.logo} alt="" loading="lazy" className="h-14 object-contain group-hover:scale-110 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                      : <span className="font-black italic text-white/25 text-xl">{(ch.name || '?').slice(0, 6)}</span>}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center"><Play className="w-4 h-4 text-black fill-current ml-0.5" /></span>
                    </span>
                  </span>
                  <span className="block px-3 py-2 text-[13px] font-bold text-white truncate text-center">{ch.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <Row title={t('mv.cartoons')} emoji="🎨" items={cartoons} />
        <Row title={t('kids.family')} emoji="👨‍👩‍👧" items={family} />
      </div>
      {askPin && <PinPad title={askPin === 'bonus' ? t('kids.parent_pin') : t('kids.exit_pin')} error={pinErr} onSubmit={tryParentPin} onCancel={() => { setAskPin(null); setPinErr(''); }} />}
    </div>
  );
}
