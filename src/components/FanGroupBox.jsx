import React, { useState, useEffect } from 'react';
import { Users, UserPlus, UserMinus } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchFanGroup, joinFanGroup, leaveFanGroup } from '../services/social';

// Nhóm fan theo phim/kênh
export default function FanGroupBox({ target, name }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    if (target) fetchFanGroup(target).then(d => {
      if (!on) return;
      setGroup(d.group); setMembers(d.members || []); setJoined(!!d.joined);
    }).catch(() => {});
    return () => { on = false; };
  }, [target]);

  const toggle = async () => {
    if (!isAuthenticated) { addToast(t('fan.need_login'), 'info'); return; }
    setBusy(true);
    try {
      if (joined) {
        await leaveFanGroup(target);
        setJoined(false);
        setMembers(m => m.filter(x => x.name));
        const d = await fetchFanGroup(target);
        setMembers(d.members || []);
      } else {
        const d = await joinFanGroup(target, name);
        setGroup(d.group); setJoined(true);
        const d2 = await fetchFanGroup(target);
        setMembers(d2.members || []);
        addToast(t('fan.joined'), 'success');
      }
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('fan.need_login') : t('fan.fail'), 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-6 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-black text-white flex items-center gap-1.5">
          <Users className="w-4 h-4 text-fuchsia-400" />
          {group?.name || `${t('fan.group')} ${name || ''}`}
        </p>
        <button onClick={toggle} disabled={busy} className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 ${joined ? 'bg-white/10 text-stone-300 hover:bg-white/15' : 'bg-fuchsia-600 text-white hover:bg-fuchsia-500 shadow-lg shadow-fuchsia-600/25'}`}>
          {joined ? <UserMinus className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
          {joined ? t('fan.leave') : t('fan.join')}
        </button>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-[10px] text-stone-500 font-bold">{members.length} {t('fan.members')}</span>
        {members.slice(0, 8).map((m, i) => (
          <span key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-fuchsia-600 to-[#f36f21] flex items-center justify-center text-[9px] font-black text-white" title={m.name}>
            {(m.name || '?').slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
