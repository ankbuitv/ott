import React, { useState, useEffect } from 'react';
import { Settings, RotateCcw, Eye, EyeOff, Globe, Database, Shield, Monitor, Trash2, Languages, Moon, Sun, MapPin, Info, Cpu, Leaf, Copy, CheckCircle2, ShieldOff } from 'lucide-react';
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

export default function SettingsPage({ onClose }) {
  const { t } = useI18n();
  const { lang, setLang, languages, detectedLang } = useI18n();
  const { settings, updateSetting, resetSettings } = useSettings();
  const device = useDevice();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ===== 2FA (TOTP) =====
  const [twoFa, setTwoFa] = useState({ loading: true, enabled: false });
  const [twoFaSetup, setTwoFaSetup] = useState(null); // {secret, otpauth}
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaMsg, setTwoFaMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const { token } = useAuth();
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
      else setTwoFaMsg(d.error || 'Lỗi tạo secret');
    } catch { setTwoFaMsg('Lỗi kết nối server'); }
  };

  const confirm2Fa = async () => {
    setTwoFaMsg('');
    try {
      const r = await fetch(`${API_BASE}/user/2fa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ code: twoFaCode }) });
      const d = await r.json();
      if (d.success) { setTwoFa({ loading: false, enabled: true }); setTwoFaSetup(null); setTwoFaCode(''); setTwoFaMsg('Đã bật 2FA! ✅'); }
      else setTwoFaMsg(d.error || 'Mã sai');
    } catch { setTwoFaMsg('Lỗi kết nối server'); }
  };

  const disable2Fa = async () => {
    setTwoFaMsg('');
    try {
      const r = await fetch(`${API_BASE}/user/2fa/disable`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ code: twoFaCode }) });
      const d = await r.json();
      if (d.success) { setTwoFa({ loading: false, enabled: false }); setTwoFaCode(''); setTwoFaMsg('Đã tắt 2FA.'); }
      else setTwoFaMsg(d.error || 'Mã sai');
    } catch { setTwoFaMsg('Lỗi kết nối server'); }
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

  return (
    <div className="p-5 md:p-7 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[#f36f21] font-bold uppercase tracking-wider text-[10px] mb-0.5">
            <Settings className="w-3.5 h-3.5" /> {t('settings.title')}
          </div>
          <h1 className="text-2xl font-extrabold text-white">{t('settings.title')}</h1>
        </div>
        {onClose && (
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            {t('common.close')}
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* ===== NGÔN NGỮ ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4 md:col-span-2">
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

        {/* ===== GIAO DIỆN ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4">
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
        </div>

        {/* ===== VIDEO ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4">
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
        </div>

        {/* ===== KIỂM SOÁT PHỤ HUYNH ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield className="w-4 h-4 text-amber-400" /> {t('settings.parental')}</h3>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.parental_enable')}</span>
            <Toggle on={!!settings.parentalEnabled} onClick={() => updateSetting('parentalEnabled', !settings.parentalEnabled)} label={t('settings.parental_enable')} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5 text-emerald-400" /> Tiết kiệm data</p>
              <p className="text-[10px] text-slate-500">Giới hạn độ phân giải video ≤ 480p (tiết kiệm 3G/4G)</p>
            </div>
            <Toggle on={!!settings.dataSaver} onClick={() => updateSetting('dataSaver', !settings.dataSaver)} label="Data saver" />
          </div>
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
          <div className="pt-2 border-t border-slate-800/40">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              {t('settings.parental_desc')}
            </p>
          </div>
        </div>

        {/* ===== HẸN GIỜ TẮT ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4">
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

        {/* ===== EPG & NGUỒN ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-400" /> {t('settings.data_sources')}</h3>
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

        {/* ===== BẢO MẬT (2FA) ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /> Bảo mật — Xác thực 2 lớp (2FA)</h3>
          {twoFa.loading ? (
            <p className="text-xs text-slate-500">Đang tải…</p>
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

        {/* ===== VỀ APP + RESET ===== */}
        <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" /> {t('settings.about')}</h3>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{t('settings.version')}</span>
            <span className="text-slate-200 font-bold">CHRTV 1.0.0</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Region</span>
            <span className="text-slate-200 font-bold">{countryFlag} {countryName}</span>
          </div>
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
      </div>
    </div>
  );
}
