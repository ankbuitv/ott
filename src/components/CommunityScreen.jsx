import React, { useState, useEffect } from 'react';
import { Users, Trophy, Save, Eye, EyeOff, Zap, Target } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { getMyProfile, saveMyProfile, fetchTopFans, fetchPredict } from '../services/social';
import ShareButtons, { buildDeepLink } from './ShareButtons';
import AdSlot from './AdSlot';

// Tab Cộng đồng: hồ sơ công khai + BXH fan cứng + BXH dự đoán
export default function CommunityScreen({ onRequireLogin }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const [prof, setProf] = useState({ handle: '', bio: '', avatar_url: '', is_public: 0 });
  const [fans, setFans] = useState([]);
  const [board, setBoard] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTopFans().then(setFans).catch(() => {});
    fetchPredict('').then(d => setBoard(d.board || [])).catch(() => {});
    if (isAuthenticated) getMyProfile().then(p => { if (p) setProf({ handle: p.handle || '', bio: p.bio || '', avatar_url: p.avatar_url || '', is_public: p.is_public ? 1 : 0 }); }).catch(() => {});
  }, [isAuthenticated]);

  const save = async () => {
    if (!isAuthenticated) { onRequireLogin && onRequireLogin(t('fan.need_login')); return; }
    setSaving(true);
    try {
      await saveMyProfile(prof);
      addToast(t('community.saved'), 'success');
    } catch (e) {
      addToast(e.message || t('community.save_fail'), 'error');
    } finally { setSaving(false); }
  };

  const myFan = fans.find(f => user && f.user_id === user.id);
  const myRank = myFan ? fans.indexOf(myFan) + 1 : 0;
  const pubLink = prof.handle ? buildDeepLink({ u: prof.handle }) : '';

  return (
    <div className="text-white pb-12">
      <div className="px-5 md:px-8 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-2xl grad-brand flex items-center justify-center shadow-lg shadow-[#f36f21]/30">
            <Users className="w-5 h-5 text-white" />
          </span>
          <div>
            <h1 className="text-[24px] font-black tracking-tight leading-none">{t('community.title')}</h1>
            <p className="text-[11px] text-stone-500 mt-1">{t('community.sub')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-5 md:px-8 space-y-8">
        <AdSlot slot="community" />
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Hồ sơ công khai */}
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
            <h2 className="text-[16px] font-extrabold mb-1">🌟 {t('community.profile')}</h2>
            <p className="text-[11px] text-stone-500 mb-3">{t('community.profile_sub')}</p>
            {!isAuthenticated ? (
              <button onClick={() => onRequireLogin && onRequireLogin(t('fan.need_login'))} className="w-full py-3 rounded-2xl grad-brand text-white text-[13px] font-bold">{t('nav.login')}</button>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">@{t('community.handle')}</label>
                  <input value={prof.handle} onChange={e => setProf({ ...prof, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) })} placeholder="vd: fan_vtv3" className="mt-1 w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder:text-stone-600 outline-none focus:border-[#f36f21]" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">{t('community.bio')}</label>
                  <input value={prof.bio} onChange={e => setProf({ ...prof, bio: e.target.value.slice(0, 200) })} placeholder={t('community.bio_ph')} className="mt-1 w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder:text-stone-600 outline-none focus:border-[#f36f21]" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">{t('community.avatar')}</label>
                  <input value={prof.avatar_url} onChange={e => setProf({ ...prof, avatar_url: e.target.value.slice(0, 300) })} placeholder="https://..." className="mt-1 w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder:text-stone-600 outline-none focus:border-[#f36f21]" />
                </div>
                <label className="flex items-center gap-2 text-[12px] font-bold text-stone-300 cursor-pointer">
                  <button onClick={() => setProf({ ...prof, is_public: prof.is_public ? 0 : 1 })} className={`w-10 h-6 rounded-full transition-all relative ${prof.is_public ? 'bg-emerald-500' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${prof.is_public ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  {prof.is_public ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-stone-500" />}
                  {t('community.public')}
                </label>
                <button onClick={save} disabled={saving} className="w-full py-3 rounded-2xl grad-brand text-white text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />{t('community.save')}
                </button>
                {prof.handle && prof.is_public ? (
                  <div className="rounded-2xl bg-black/30 border border-white/[0.06] p-3">
                    <p className="text-[10px] text-stone-500 font-bold mb-1.5 truncate">{pubLink}</p>
                    <ShareButtons url={pubLink} title={`@${prof.handle} — CHRTV PLAY`} compact />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* BXH fan cứng */}
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
            <h2 className="text-[16px] font-extrabold mb-1 flex items-center gap-2">🏆 {t('community.topfans')}</h2>
            <p className="text-[11px] text-stone-500 mb-3">{t('community.topfans_sub')}</p>
            {myFan && (
              <div className="flex items-center gap-2 rounded-2xl bg-[#f36f21]/10 border border-[#f36f21]/40 px-3 py-2 mb-2">
                <span className="text-[11px] font-black text-[#ffb37a]">#{myRank}</span>
                <span className="flex-1 text-[12px] font-bold text-white truncate">{myFan.name || user?.username}</span>
                <span className="text-[12px] font-black text-amber-300 flex items-center gap-1"><Zap className="w-3.5 h-3.5" />{myFan.xp}</span>
              </div>
            )}
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
              {fans.length === 0 && <p className="text-[12px] text-stone-600 italic text-center py-6">{t('sports.no_data')}</p>}
              {fans.map((f, i) => (
                <div key={f.user_id} className="flex items-center gap-2.5 rounded-2xl bg-black/30 border border-white/[0.05] px-3 py-2">
                  <span className={`w-7 h-7 rounded-lg text-[12px] font-black flex items-center justify-center shrink-0 ${i === 0 ? 'bg-amber-500/20 text-amber-300' : i < 3 ? 'bg-white/10 text-white' : 'text-stone-500'}`}>{i + 1}</span>
                  {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" /> : (
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#f36f21] to-fuchsia-600 flex items-center justify-center text-[11px] font-black text-white shrink-0">{(f.name || '?').slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="flex-1 text-[12px] font-bold text-slate-200 truncate">{f.name || `Fan #${f.user_id}`}</span>
                  <span className="text-[12px] font-black text-amber-300 flex items-center gap-1 tabular-nums"><Zap className="w-3.5 h-3.5" />{f.xp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BXH dự đoán */}
        {board.length > 0 && (
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
            <h2 className="text-[16px] font-extrabold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400" />🔮 {t('match.board')}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {board.slice(0, 8).map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-2xl bg-black/30 border border-white/[0.05] px-3 py-2">
                  <Trophy className={`w-4 h-4 shrink-0 ${i === 0 ? 'text-amber-400' : 'text-stone-600'}`} />
                  <span className="flex-1 text-[12px] font-bold text-slate-200 truncate">{r.name || '?'}</span>
                  <span className="text-[12px] font-black text-white tabular-nums">{r.pts}đ</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
