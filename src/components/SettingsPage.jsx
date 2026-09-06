import React, { useState, useEffect } from 'react';
import { Settings, RotateCcw, Crown, Eye, EyeOff, Globe, Database, Shield, Monitor, Trash2, Languages, Moon, Sun, MapPin, Info, Cpu, Leaf, Copy, CheckCircle2, ShieldOff, Palette, Tv, Trophy, Smartphone, LogOut, QrCode, Users, KeyRound, Lock } from 'lucide-react';
import ShareButtons from './ShareButtons';
import { getDeviceInfo } from '../services/device';
import { Fingerprint, Wifi, Clock, Server } from 'lucide-react';
import { hasAppPin, setAppPin, clearAppPin, weekReport, getKidLimit, setKidLimit, fmtDur } from '../services/kids';
import { useProfile } from '../contexts/ProfileContext';
import QrScanner from './QrScanner';
import PlansScreen from './PlansScreen';
import { BADGES, getStats, fmtHours, badgeName, badgeDesc } from '../services/achievements';
import { API_BASE } from '../services/config';
import { useSettings } from '../contexts/SettingsContext';
import { useDevice } from '../contexts/DeviceContext';
import { useI18n } from '../contexts/I18nContext';
import { detectCountry } from '../i18n/translations';
import { COUNTRY_INFO } from '../services/tmdb';
import { removeStorage } from '../hooks/useStorage';
import { useAuth } from '../contexts/AuthContext';

// Toggle chung
function Toggle({ on, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full transition-all shrink-0 ${on ? 'bg-[#f36f21]' : 'bg-slate-700'}`}
      aria-label={label}
    >
      <div className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

// Dòng info trong About
function AboutRow({ Icon, label, value, loading, mono, accent }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
      <span className="flex items-center gap-2 text-slate-400 shrink-0">{Icon && <Icon className="w-3.5 h-3.5" />} {label}</span>
      {loading ? (
        <span className="w-20 h-3.5 rounded bg-white/10 animate-pulse" />
      ) : (
        <span className={`font-bold text-right truncate ${mono ? 'font-mono text-[11px]' : ''} ${accent || 'text-slate-200'}`}>{value || '—'}</span>
      )}
    </div>
  );
}

export default function SettingsPage({ onClose }) {
  const { profiles } = useProfile();
  const [pinOn, setPinOn] = useState(() => hasAppPin());
  const [pinNew, setPinNew] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const { t, lang, setLang, languages, detectedLang } = useI18n();
  const { settings, updateSetting, resetSettings } = useSettings();
  const device = useDevice();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [active, setActive] = useState('lang'); // master-detail: mục đang chọn

  // ===== 2FA (TOTP) =====
  const [twoFa, setTwoFa] = useState({ loading: true, enabled: false });
  const [twoFaSetup, setTwoFaSetup] = useState(null); // {secret, otpauth}
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaMsg, setTwoFaMsg] = useState('');
  const [sessions, setSessions] = useState([]);
  const [currentSessId, setCurrentSessId] = useState(0);
  const [sessLoading, setSessLoading] = useState(false);
  const [achStats, setAchStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [devInfo, setDevInfo] = useState(null);
  const [fpCopied, setFpCopied] = useState(false);

  // Nạp thông tin thiết bị khi mở mục Giới thiệu
  useEffect(() => {
    if (active !== 'about' || devInfo) return;
    let on = true;
    getDeviceInfo().then((d) => { if (on) setDevInfo(d); }).catch(() => {});
    return () => { on = false; };
  }, [active]);

  const copyFp = async () => {
    if (!devInfo?.fingerprint) return;
    try {
      await navigator.clipboard.writeText(devInfo.fingerprint);
      setFpCopied(true);
      setTimeout(() => setFpCopied(false), 1500);
    } catch {}
  };

  const { token, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showQr, setShowQr] = useState(false);

  // ===== ĐỔI MẬT KHẨU (user đã đăng nhập) =====
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // { type: 'ok' | 'err', text }
  const [pwLogoutOthers, setPwLogoutOthers] = useState(true);

  // Đo độ mạnh mật khẩu (0-4) — chỉ để gợi ý, server vẫn là nơi kiểm tra cuối
  const pwScore = (() => {
    const p = pwNew || '';
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p) && /[^\w\s]/.test(p)) s++;
    return Math.min(s, 4);
  })();
  const pwScoreLabel = [t('settings.pw_weak'), t('settings.pw_weak'), t('settings.pw_fair'), t('settings.pw_good'), t('settings.pw_strong')][pwScore];
  const pwScoreColor = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'][pwScore];

  const submitChangePassword = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setPwMsg(null);
    if (!token) { setPwMsg({ type: 'err', text: t('settings.pw_need_login') }); return; }
    if (!pwOld || !pwNew) { setPwMsg({ type: 'err', text: t('settings.pw_missing') }); return; }
    if (pwNew.length < 6) { setPwMsg({ type: 'err', text: t('settings.pw_short') }); return; }
    if (pwNew !== pwNew2) { setPwMsg({ type: 'err', text: t('settings.pw_mismatch') }); return; }
    if (pwNew === pwOld) { setPwMsg({ type: 'err', text: t('settings.pw_same') }); return; }
    setPwBusy(true);
    try {
      const r = await fetch(`${API_BASE}/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: pwOld, newPassword: pwNew, logoutOthers: pwLogoutOthers }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) {
        setPwOld(''); setPwNew(''); setPwNew2('');
        const n = d.sessionsRevoked || 0;
        setPwMsg({ type: 'ok', text: n > 0 ? t('settings.pw_ok_revoked', { n }) : t('settings.pw_ok') });
        loadSessions();
      } else {
        setPwMsg({ type: 'err', text: d.error || t('settings.pw_fail') });
      }
    } catch {
      setPwMsg({ type: 'err', text: t('settings.pw_net') });
    }
    setPwBusy(false);
  };

  // Phiên đăng nhập
  const loadSessions = async () => {
    if (!token) return;
    setSessLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/sessions`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setSessions(d.sessions || []);
      setCurrentSessId(d.currentId || 0);
    } catch {}
    setSessLoading(false);
  };
  const revokeSession = async (id) => {
    if (!token || !id) return;
    try {
      await fetch(`${API_BASE}/auth/sessions`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) });
      loadSessions();
    } catch {}
  };
  useEffect(() => { loadSessions(); setAchStats(getStats()); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/user/2fa/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setTwoFa({ loading: false, enabled: !!d.enabled }))
      .catch(() => setTwoFa({ loading: false, enabled: false }));
  }, [token]);

  const startSetup2Fa = async () => {
    setTwoFaMsg('');
    try {
      const r = await fetch(`${API_BASE}/user/2fa/setup`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setTwoFaSetup(d);
      else setTwoFaMsg(d.error || t('settings.2fa_err'));
    } catch { setTwoFaMsg(t('settings.2fa_net')); }
  };

  const confirm2Fa = async () => {
    setTwoFaMsg('');
    try {
      const r = await fetch(`${API_BASE}/user/2fa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ code: twoFaCode }) });
      const d = await r.json();
      if (d.success) { setTwoFa({ loading: false, enabled: true }); setTwoFaSetup(null); setTwoFaCode(''); setTwoFaMsg('Đã bật 2FA! ✅'); }
      else setTwoFaMsg(d.error || t('settings.2fa_wrong'));
    } catch { setTwoFaMsg(t('settings.2fa_net')); }
  };

  const disable2Fa = async () => {
    setTwoFaMsg('');
    try {
      const r = await fetch(`${API_BASE}/user/2fa/disable`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ code: twoFaCode }) });
      const d = await r.json();
      if (d.success) { setTwoFa({ loading: false, enabled: false }); setTwoFaCode(''); setTwoFaMsg('Đã tắt 2FA.'); }
      else setTwoFaMsg(d.error || t('settings.2fa_wrong'));
    } catch { setTwoFaMsg(t('settings.2fa_net')); }
  };

  const country = detectCountry();
  const countryInfo = COUNTRY_INFO[country] || COUNTRY_INFO.US;
  const countryFlag = countryInfo.flag;
  const countryName = countryInfo.name;

  const handleReset = () => {
    if (showConfirm) {
      resetSettings();
      removeStorage('chrtv_favorites');
      removeStorage('chrtv_history');
      removeStorage('chrtv_fav_groups');
      removeStorage('chrtv_settings');
      setShowConfirm(false);
      onClose && onClose();
    } else {
      setShowConfirm(true);
    }
  };

  const navItems = [
    { id: 'lang', label: t('settings.language'), Icon: Languages },
    { id: 'appearance', label: t('settings.appearance'), Icon: Palette },
    { id: 'video', label: t('settings.video'), Icon: Monitor },
    { id: 'parental', label: t('settings.parental'), Icon: Shield },
    { id: 'sleep', label: t('settings.sleep_timer'), Icon: Cpu },
    ...(isAdmin ? [{ id: 'sources', label: t('settings.data_sources'), Icon: Globe }] : []),
    { id: 'sessions', label: t('settings.sessions'), Icon: Smartphone },
    { id: 'password', label: t('settings.pw_title'), Icon: Lock },
    { id: 'badges', label: t('settings.ach_title'), Icon: Trophy },
    { id: 'family', label: t('settings.family'), Icon: Users },
    { id: 'pin', label: t('settings.app_pin'), Icon: KeyRound },
    { id: '2fa', label: '2FA', Icon: QrCode },
    { id: 'plans', label: t('nav.plans'), Icon: Crown },
    { id: 'about', label: t('settings.about'), Icon: Info },
  ];

  return (
    <div className="p-5 md:p-7 space-y-5 max-w-6xl mx-auto">
      {showQr && token && <QrScanner onClose={() => setShowQr(false)} />}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[#f36f21] font-bold uppercase tracking-wider text-[10px] mb-0.5">
            <Settings className="w-3.5 h-3.5" /> {t('settings.title')}
          </div>
          <h1 className="text-2xl font-extrabold text-white">{t('settings.title')}</h1>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-stone-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {t('settings.synced')}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* LEFT: nav */}
        <nav className="w-full md:w-60 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 scrollbar-none bg-[#14151c] border border-white/[0.07] rounded-2xl p-2 md:self-start">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setActive(id); try { document.querySelector('main')?.scrollTo({ top: 0 }); } catch {} }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all active:scale-[0.98] flex-1 md:flex-none ${
                active === id
                  ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/25'
                  : 'text-stone-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" /> {label}
            </button>
          ))}
        </nav>
        {/* RIGHT: content */}
        <div className="flex-1 min-w-0 w-full">
        {active === 'plans' ? <PlansScreen /> : (<>
        {/* ===== NGÔN NGỮ ===== */}
        {active === 'lang' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4 md:col-span-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Languages className="w-4 h-4 text-[#ff9a3d]" /> {t('settings.language')}</h3>
          <div className="flex flex-wrap gap-2.5">
            {languages.map(l => {
              const active = lang === l.code;
              const isDetected = detectedLang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                    active
                      ? 'bg-[#f36f21] border-[#f36f21] text-white shadow-lg shadow-[#f36f21]/20'
                      : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 hover:text-white'
                  }`}
                >
                  <span className="text-lg leading-none">{l.flag}</span>
                  {l.label}
                  {isDetected && (
                    <span className={`ml-1 px-1.5 py-0.5 text-[8px] font-bold rounded ${active ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-400'}`}>
                      {t('settings.detected').toUpperCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            {t('settings.region_label')}: <span className="text-stone-300 font-bold">{countryFlag} {countryName}</span>
            <span className="text-stone-600">·</span>
            {t('settings.current_lang')}: <span className="text-stone-300 font-bold">{languages.find(l => l.code === lang)?.label || lang}</span>
          </div>
        </div>
        )}

        {/* ===== GIAO DIỆN ===== */}
        {active === 'appearance' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Moon className="w-4 h-4 text-blue-400" /> {t('settings.appearance')}</h3>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.theme')}</span>
            <div className="flex gap-1.5">
              {['dark', 'light'].map(t_opt => (
                <button
                  key={t_opt}
                  onClick={() => updateSetting('theme', t_opt)}
                  className={`px-4 py-2 text-xs rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    settings.theme === t_opt ? 'bg-[#f36f21] text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t_opt === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                  {t_opt === 'dark' ? t('settings.dark') : t('settings.light')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-pink-400" /> {t('settings.color_theme')}</span>
            <div className="flex gap-1.5">
              {[
                { v: 'sunset', label: t('settings.theme_sunset'), grad: 'linear-gradient(135deg,#f36f21,#ff9a3d)' },
                { v: 'ocean', label: t('settings.theme_ocean'), grad: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
                { v: 'fire', label: t('settings.theme_fire'), grad: 'linear-gradient(135deg,#ef4444,#f59e0b)' },
              ].map(o => (
                <button key={o.v} onClick={() => updateSetting('colorTheme', o.v)} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium transition-all ${settings.colorTheme === o.v ? 'bg-slate-700 text-white ring-1 ring-[#f36f21]' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  <span className="w-3.5 h-3.5 rounded-full" style={{ background: o.grad }}></span>{o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5"><Tv className="w-3.5 h-3.5 text-cyan-400" /> {t('settings.tv_mode')}</p>
              <p className="text-[10px] text-slate-500">{t('settings.tv_mode_desc')}</p>
            </div>
            <Toggle on={!!settings.tvMode} onClick={() => updateSetting('tvMode', !settings.tvMode)} label="TV mode" />
          </div>
        </div>
        )}

        {/* ===== VIDEO ===== */}
        {active === 'video' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Monitor className="w-4 h-4 text-blue-400" /> {t('settings.video')}</h3>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.default_quality')}</span>
            <select
              value={settings.defaultQuality}
              onChange={e => updateSetting('defaultQuality', e.target.value)}
              className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-lg border border-slate-700"
            >
              <option value="auto">{t('settings.auto')}</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
              <option value="360">360p</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.buffer_goal')}</span>
            <input
              type="number"
              value={settings.bufferGoal}
              onChange={e => updateSetting('bufferGoal', parseInt(e.target.value) || 10)}
              min={1} max={60}
              className="bg-slate-800 text-xs text-slate-200 w-20 text-center px-2 py-2 rounded-lg border border-slate-700"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.rebuffering_goal')}</span>
            <input
              type="number"
              value={settings.rebufferingGoal}
              onChange={e => updateSetting('rebufferingGoal', parseInt(e.target.value) || 2)}
              min={0} max={30}
              className="bg-slate-800 text-xs text-slate-200 w-20 text-center px-2 py-2 rounded-lg border border-slate-700"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.buffer_behind')}</span>
            <input
              type="number"
              value={settings.bufferBehind}
              onChange={e => updateSetting('bufferBehind', parseInt(e.target.value) || 15)}
              min={0} max={60}
              className="bg-slate-800 text-xs text-slate-200 w-20 text-center px-2 py-2 rounded-lg border border-slate-700"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.auto_next')}</span>
            <Toggle on={!!settings.autoNextOn} onClick={() => updateSetting('autoNextOn', !settings.autoNextOn)} label={t('settings.auto_next')} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.show_stats')}</span>
            <Toggle on={!!settings.showStats} onClick={() => updateSetting('showStats', !settings.showStats)} label={t('settings.show_stats')} />
          </div>
          {device.isMobile && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{t('settings.gesture')}</span>
              <Toggle on={!!settings.gestureEnabled} onClick={() => updateSetting('gestureEnabled', !settings.gestureEnabled)} label={t('settings.gesture')} />
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
            <div>
              <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5 text-purple-400" /> {t('settings.spoiler')}</p>
              <p className="text-[10px] text-slate-500">{t('settings.spoiler_desc')}</p>
            </div>
            <Toggle on={!!settings.spoilerMask} onClick={() => updateSetting('spoilerMask', !settings.spoilerMask)} label="Spoiler mask" />
          </div>
        </div>
        )}

        {/* ===== KIỂM SOÁT PHỤ HUYNH ===== */}
        {active === 'parental' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield className="w-4 h-4 text-amber-400" /> {t('settings.parental')}</h3>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.parental_enable')}</span>
            <Toggle on={!!settings.parentalEnabled} onClick={() => updateSetting('parentalEnabled', !settings.parentalEnabled)} label={t('settings.parental_enable')} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5 text-emerald-400" /> {t('settings.data_saver')}</p>
              <p className="text-[10px] text-slate-500">{t('settings.data_saver_desc')}</p>
            </div>
            <Toggle on={!!settings.dataSaver} onClick={() => updateSetting('dataSaver', !settings.dataSaver)} label="Data saver" />
          </div>
          {settings.dataSaver && (
            <div className="flex items-center justify-between pl-1">
              <span className="text-xs text-slate-400">{t('settings.data_cap')}</span>
              <select
                value={settings.dataSaverCap || 480}
                onChange={e => updateSetting('dataSaverCap', parseInt(e.target.value) || 480)}
                className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-lg border border-slate-700"
              >
                <option value={240}>240p ({t('settings.cap_ultra')})</option>
                <option value={360}>360p ({t('settings.cap_save')})</option>
                <option value={480}>480p ({t('settings.cap_bal')})</option>
                <option value={720}>720p ({t('settings.cap_mid')})</option>
              </select>
            </div>
          )}
          {settings.parentalEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">PIN:</span>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin || settings.parentalPin}
                  onChange={e => { setPin(e.target.value); updateSetting('parentalPin', e.target.value); }}
                  maxLength={6}
                  placeholder={t('settings.pin_placeholder')}
                  className="bg-slate-800 text-xs text-slate-200 w-32 px-3 py-2 rounded-lg border border-slate-700 pr-8"
                />
                <button onClick={() => setShowPin(!showPin)} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5">
                  {showPin ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
            <div>
              <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5"><Moon className="w-3.5 h-3.5 text-indigo-400" /> 🌙 {t('settings.bedtime')}</p>
              <p className="text-[10px] text-slate-500">{t('settings.bedtime_desc')}</p>
            </div>
            <Toggle on={!!settings.kidBedtimeEnabled} onClick={() => updateSetting('kidBedtimeEnabled', !settings.kidBedtimeEnabled)} label="Bedtime" />
          </div>
          {settings.kidBedtimeEnabled && (
            <div className="flex items-center gap-2 pl-1">
              <span className="text-xs text-slate-400">{t('settings.from')}</span>
              <input type="time" value={settings.kidBedtimeStart || '21:00'} onChange={e => updateSetting('kidBedtimeStart', e.target.value)} className="bg-slate-800 text-xs text-slate-200 px-2 py-1.5 rounded-lg border border-slate-700" />
              <span className="text-xs text-slate-400">{t('settings.to')}</span>
              <input type="time" value={settings.kidBedtimeEnd || '06:00'} onChange={e => updateSetting('kidBedtimeEnd', e.target.value)} className="bg-slate-800 text-xs text-slate-200 px-2 py-1.5 rounded-lg border border-slate-700" />
            </div>
          )}
          <div className="pt-2 border-t border-slate-800/40">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              {t('settings.parental_desc')}
            </p>
          </div>
        </div>
        )}

        {/* ===== HẸN GIỜ TẮT ===== */}
        {active === 'sleep' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Cpu className="w-4 h-4 text-purple-400" /> {t('settings.sleep_timer')}</h3>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.sleep_timer')}</span>
            <select
              value={settings.sleepTimerMinutes || 0}
              onChange={e => updateSetting('sleepTimerMinutes', parseInt(e.target.value) || 0)}
              className="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-lg border border-slate-700"
            >
              <option value={0}>{t('settings.off')}</option>
              <option value={15}>15 {t('settings.minutes')}</option>
              <option value={30}>30 {t('settings.minutes')}</option>
              <option value={60}>60 {t('settings.minutes')}</option>
              <option value={90}>90 {t('settings.minutes')}</option>
              <option value={120}>120 {t('settings.minutes')}</option>
            </select>
          </div>
          <div className="pt-2 border-t border-slate-800/40">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              {t('settings.sleep_desc')}
            </p>
          </div>
        </div>
        )}

        {/* ===== EPG & NGUỒN (chỉ admin) ===== */}
        {isAdmin && active === 'sources' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-400" /> {t('settings.data_sources')} <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">ADMIN</span></h3>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 block">{t('settings.epg_url')}</label>
            <input
              type="url"
              value={settings.epgSource}
              onChange={e => updateSetting('epgSource', e.target.value)}
              placeholder="https://epg.io.vn/epgc.xml"
              className="w-full bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-lg border border-slate-700 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 block"><Database className="w-3 h-3 inline mr-1" /> {t('settings.database_status')}</label>
            <p className="text-[10px] text-slate-600 leading-relaxed">{t('settings.database_desc')}</p>
          </div>
        </div>
        )}

        {/* ===== PHIÊN ĐĂNG NHẬP ===== */}
        {active === 'sessions' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Smartphone className="w-4 h-4 text-cyan-400" /> {t('settings.sessions')}</h3>
            {token && (
              <button onClick={() => setShowQr(true)} className="flex items-center gap-1.5 px-3 py-1.5 grad-brand text-white text-[11px] font-bold rounded-xl shadow-md shadow-[#f36f21]/25">
                <QrCode className="w-3.5 h-3.5" /> {t('settings.scan_qr')}
              </button>
            )}
          </div>
          {!token ? (
            <p className="text-[11px] text-slate-500">{t('settings.sess_login')}</p>
          ) : sessLoading ? (
            <p className="text-xs text-slate-500">{t('app.loading')}</p>
          ) : sessions.length === 0 ? (
            <p className="text-[11px] text-slate-500">{t('settings.sess_empty')}</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {sessions.map(s => {
                const ua = s.user_agent || t('settings.sess_unknown');
                const isCur = s.id === currentSessId;
                const dev = /mobile|android|iphone/i.test(ua) ? '📱' : /tv|smarttv|tizen|webos/i.test(ua) ? '📺' : '💻';
                return (
                  <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${isCur ? 'border-emerald-600/50 bg-emerald-950/20' : 'border-slate-800/60 bg-black/20'}`}>
                    <span className="text-lg">{dev}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-200 truncate">{ua}</p>
                      <p className="text-[9px] text-slate-500">
                        {isCur ? <span className="text-emerald-400 font-bold">● {t('settings.sess_this')} · </span> : null}
                        {t('settings.sess_exp')} {new Date(s.expires_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                      </p>
                    </div>
                    {!isCur && (
                      <button onClick={() => revokeSession(s.id)} title={t('settings.sess_revoke')} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-all">
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* ===== HUY HIỆU ===== */}
        {active === 'badges' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> {t('settings.ach_title')}</h3>
          {achStats && (
            <p className="text-[11px] text-slate-400">
              {t('settings.ach_sum', { h: fmtHours(achStats.totalSec || 0, lang), c: (achStats.channels || []).length, s: achStats.streak || 0, g: (achStats.badges || []).length, n: BADGES.length })}
            </p>
          )}
          {achStats && (achStats.badges || []).length > 0 && (
            <ShareButtons
              url={typeof window !== 'undefined' ? window.location.href : ''}
              title={t('settings.ach_share', { g: (achStats.badges || []).length, h: fmtHours(achStats.totalSec || 0, lang) })}
              compact
            />
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {BADGES.map(b => {
              const got = achStats?.badges?.includes(b.id);
              return (
                <div key={b.id} title={`${badgeName(b, lang)} — ${badgeDesc(b, lang)}`} className={`rounded-xl border px-2 py-2.5 text-center transition-all ${got ? 'border-amber-500/50 bg-amber-950/20' : 'border-slate-800/60 bg-black/20 opacity-45 grayscale'}`}>
                  <div className="text-xl">{b.icon}</div>
                  <div className="text-[9px] font-bold text-slate-200 mt-1 leading-tight">{badgeName(b, lang)}</div>
                  <div className="text-[8px] text-slate-500 leading-tight mt-0.5">{badgeDesc(b, lang)}</div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* ===== GIA ĐÌNH & BÁO CÁO BÉ ===== */}
        {active === 'family' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-fuchsia-400" /> {t('settings.family')}</h3>
          {(profiles || []).filter(p => p.is_child).length === 0 && (
            <p className="text-[11px] text-slate-500">{t('settings.no_kids')}</p>
          )}
          {(profiles || []).filter(p => p.is_child).map(p => {
            const rep = weekReport(p.id);
            const lim = getKidLimit(p.id);
            const max = Math.max(1, ...rep.days.map(d => d.sec));
            return (
              <div key={p.id} className="rounded-2xl bg-black/30 border border-white/[0.06] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[13px] font-black text-white">🧒 {p.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-bold">{t('settings.limit_day')}</span>
                    <input
                      type="number" min="0" max="1440" defaultValue={lim} key={`${p.id}-${lim}`}
                      onBlur={e => setKidLimit(p.id, e.target.value)}
                      className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[12px] font-bold text-white text-center outline-none focus:border-[#f36f21]"
                    />
                    <span className="text-[10px] text-slate-500">′</span>
                  </div>
                </div>
                <div className="flex items-end gap-1 h-16">
                  {rep.days.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${fmtDur(d.sec)}`}>
                      <div className="w-full rounded-t-md bg-gradient-to-t from-[#f36f21] to-amber-400 min-h-[3px]" style={{ height: `${Math.max(4, Math.round((d.sec / max) * 52))}px` }} />
                      <span className="text-[8px] text-slate-600 font-bold">{d.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">{t('settings.week_total')}: <b className="text-slate-300">{fmtDur(rep.total)}</b>
                  {rep.top.length > 0 && <span> · ⭐ {rep.top.slice(0, 3).map(([name, sec]) => `${name} (${fmtDur(sec)})`).join(' · ')}</span>}
                </p>
              </div>
            );
          })}
        </div>
        )}

        {/* ===== PIN MỞ APP ===== */}
        {active === 'pin' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-400" /> {t('settings.app_pin')}</h3>
          <p className="text-[11px] text-slate-400">{t('settings.pin_sub')}</p>
          {pinOn ? (
            <button onClick={() => { clearAppPin(); setPinOn(false); setPinMsg(t('settings.pin_off')); }} className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl">{t('settings.pin_disable')}</button>
          ) : (
            <div className="flex gap-2">
              <input value={pinNew} onChange={e => { setPinNew(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinMsg(''); }} placeholder="PIN 4-8 số" inputMode="numeric" className="w-36 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono tracking-widest text-white text-center outline-none focus:border-amber-500" />
              <button onClick={async () => { if (await setAppPin(pinNew)) { setPinOn(true); setPinNew(''); setPinMsg(t('settings.pin_on')); } else setPinMsg(t('settings.pin_invalid')); }} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl">{t('settings.pin_enable')}</button>
            </div>
          )}
          {pinMsg && <p className="text-[11px] text-amber-400">{pinMsg}</p>}
        </div>
        )}

        {/* ===== ĐỔI MẬT KHẨU ===== */}
        {active === 'password' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Lock className="w-4 h-4 text-[#ff9a3d]" /> {t('settings.pw_title')}</h3>
          {!token ? (
            <p className="text-xs text-slate-500">{t('settings.pw_need_login')}</p>
          ) : (
            <form onSubmit={submitChangePassword} className="space-y-3.5 max-w-md">
              <div className="text-[11px] text-slate-400 leading-relaxed">
                {t('settings.pw_desc')}
                {user?.email ? <> <span className="text-slate-300 font-bold">{user.email}</span></> : null}
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400">{t('settings.pw_old')}</span>
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwOld}
                  onChange={(e) => setPwOld(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-[#f36f21]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400">{t('settings.pw_new')}</span>
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-[#f36f21]"
                />
              </label>

              {pwNew && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full ${pwScoreColor} transition-all`} style={{ width: `${(pwScore / 4) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 w-20 text-right">{pwScoreLabel}</span>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400">{t('settings.pw_new2')}</span>
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwNew2}
                  onChange={(e) => setPwNew2(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full px-3.5 py-2.5 bg-slate-800 border rounded-xl text-sm text-white focus:outline-none ${
                    pwNew2 && pwNew2 !== pwNew ? 'border-red-500/70' : 'border-slate-700 focus:border-[#f36f21]'
                  }`}
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPwShow((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white"
                >
                  {pwShow ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {pwShow ? t('settings.pw_hide') : t('settings.pw_show')}
                </button>
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input type="checkbox" checked={pwLogoutOthers} onChange={(e) => setPwLogoutOthers(e.target.checked)} className="accent-[#f36f21]" />
                  {t('settings.pw_logout_others')}
                </label>
              </div>

              <button
                type="submit"
                disabled={pwBusy || !pwOld || !pwNew || !pwNew2}
                className="w-full px-4 py-2.5 grad-brand disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <KeyRound className="w-4 h-4" /> {pwBusy ? t('settings.pw_saving') : t('settings.pw_submit')}
              </button>

              {pwMsg && (
                <p className={`text-[11px] flex items-start gap-1.5 ${pwMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pwMsg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" /> : <ShieldOff className="w-3.5 h-3.5 mt-px shrink-0" />}
                  {pwMsg.text}
                </p>
              )}

              <p className="text-[10px] text-slate-600 leading-relaxed pt-1 border-t border-white/[0.05]">
                {t('settings.pw_forgot_hint')}
              </p>
            </form>
          )}
        </div>
        )}

        {/* ===== BẢO MẬT (2FA) ===== */}
        {active === '2fa' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /> Bảo mật — Xác thực 2 lớp (2FA)</h3>
          {twoFa.loading ? (
            <p className="text-xs text-slate-500">{t('app.loading')}</p>
          ) : !twoFa.enabled ? (
            !twoFaSetup ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">Bật 2FA để bảo vệ tài khoản bằng mã 6 số từ Google Authenticator / Authy. Đăng nhập sẽ cần thêm mã này.</p>
                <button onClick={startSetup2Fa} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl">Bật 2FA</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-slate-400">1. Mở Google Authenticator → thêm tài khoản → dán URL hoặc nhập secret:</p>
                <div className="bg-black/40 rounded-lg p-2.5 text-[10px] font-mono text-emerald-300 break-all select-all">{twoFaSetup.otpauth}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Secret:</span>
                  <code className="text-[11px] font-mono text-slate-200">{twoFaSetup.secret}</code>
                  <button onClick={() => { navigator.clipboard.writeText(twoFaSetup.secret).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-slate-400 hover:text-white">
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">2. Nhập mã 6 số hiện trong app để xác nhận:</p>
                <div className="flex gap-2">
                  <input value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" className="w-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono tracking-widest text-white text-center focus:outline-none focus:border-emerald-500" />
                  <button onClick={confirm2Fa} disabled={twoFaCode.length !== 6} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl">Xác nhận</button>
                  <button onClick={() => { setTwoFaSetup(null); setTwoFaMsg(''); }} className="px-3 py-2 text-xs text-slate-500 hover:text-white">Hủy</button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> 2FA đang BẬT — tài khoản của bạn được bảo vệ 2 lớp.</p>
              <div className="flex gap-2">
                <input value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Mã 2FA để tắt" inputMode="numeric" className="w-40 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono tracking-widest text-white text-center focus:outline-none focus:border-[#f36f21]" />
                <button onClick={disable2Fa} disabled={twoFaCode.length !== 6} className="px-4 py-2 bg-[#f36f21]/90 hover:bg-[#f36f21] disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"><ShieldOff className="w-3.5 h-3.5" /> Tắt 2FA</button>
              </div>
            </div>
          )}
          {twoFaMsg && <p className="text-[11px] text-amber-400">{twoFaMsg}</p>}
        </div>
        )}

        {/* ===== VỀ APP + RESET ===== */}
        {active === 'about' && (
        <div className="bg-[#14151c] border border-white/[0.07] rounded-2xl p-5 shadow-xl shadow-black/30 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" /> {t('settings.about')}</h3>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{t('settings.version')}</span>
            <span className="text-slate-200 font-bold">CHRTV PLAY 2.0</span>
          </div>
          {/* ===== Thiết bị đang dùng ===== */}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 divide-y divide-white/[0.05] overflow-hidden">
            <AboutRow Icon={Globe} label={t('about.browser')} value={devInfo?.browser} loading={!devInfo} />
            <AboutRow Icon={Cpu} label={t('about.os')} value={devInfo?.os ? `${devInfo.os}${devInfo.cores ? ` · ${devInfo.cores} CPU` : ''}` : ''} loading={!devInfo} />
            <AboutRow Icon={device.isMobile ? Smartphone : Monitor} label={t('about.device')} value={devInfo ? t(`about.kind_${devInfo.kind}`) : ''} loading={!devInfo} />
            <AboutRow Icon={Monitor} label={t('about.screen')} value={devInfo?.screen ? `${devInfo.screen}${devInfo.viewport ? ` · view ${devInfo.viewport}` : ''}` : ''} loading={!devInfo} />
            <AboutRow Icon={Languages} label={t('about.lang_tz')} value={devInfo ? `${devInfo.lang || '?'} · ${devInfo.tz || '?'}` : ''} loading={!devInfo} />
            <AboutRow Icon={MapPin} label={t('about.country')} value={`${countryFlag} ${countryName} (${country})`} />
            <AboutRow Icon={Wifi} label={t('about.net')} value={devInfo ? (devInfo.online ? t('about.online') : t('about.offline')) : ''} loading={!devInfo} accent={devInfo ? (devInfo.online ? 'text-emerald-400' : 'text-red-400') : ''} />
            {devInfo?.standalone && <AboutRow Icon={CheckCircle2} label={t('about.app_mode')} value={t('about.pwa')} accent="text-emerald-400" />}
            <AboutRow Icon={Server} label={t('about.server')} value={API_BASE.replace(/^https?:\/\//, '').slice(0, 40)} mono />
          </div>
          {/* Fingerprint */}
          <div className="rounded-xl border border-[#f36f21]/25 bg-[#f36f21]/[0.05] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-stone-300"><Fingerprint className="w-3.5 h-3.5 text-[#ff9a3d]" /> {t('about.fp')}</span>
              <button onClick={copyFp} className="flex items-center gap-1 text-[11px] font-bold text-stone-400 hover:text-white transition-colors">
                {fpCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {fpCopied ? t('about.copied') : t('about.copy')}
              </button>
            </div>
            <div className="font-mono text-[15px] font-black tracking-[0.2em] text-white text-center select-all">{devInfo?.fingerprint || '…'}</div>
            <p className="text-[10px] text-stone-500 text-center mt-1">{t('about.fp_hint')}</p>
          </div>
          {/* User-Agent */}
          {devInfo?.ua && (
            <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-400 mb-1"><Clock className="w-3.5 h-3.5" /> User-Agent</div>
              <p className="text-[10px] text-stone-500 break-all leading-relaxed font-mono">{devInfo.ua}</p>
            </div>
          )}
          <div className="pt-3 border-t border-slate-800/40">
            <button
              onClick={handleReset}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                showConfirm ? 'bg-[#f36f21] text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {showConfirm ? <><Trash2 className="w-4 h-4" /> {t('settings.confirm_reset')}</> : <><RotateCcw className="w-4 h-4" /> {t('settings.reset_default')}</>}
            </button>
            {showConfirm && (
              <button onClick={() => setShowConfirm(false)} className="w-full mt-2 px-4 py-1.5 text-xs text-slate-500 hover:text-slate-300 rounded-lg">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
        )}
        </>)}
        </div>
      </div>
    </div>
  );
}
