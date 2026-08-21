import React, { useState } from 'react';
import { Settings, RotateCcw, Eye, EyeOff, Globe, Database, Shield, Monitor, Trash2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useDevice } from '../contexts/DeviceContext';
import { useI18n } from '../contexts/I18nContext';
import { removeStorage } from '../hooks/useStorage';

export default function SettingsPage({ onClose }) {
  const { t } = useI18n();
  const { settings, updateSetting, resetSettings } = useSettings();
  const device = useDevice();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
    <div className="p-5 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-red-500 font-bold uppercase tracking-wider text-[10px] mb-0.5">
            <Settings className="w-3.5 h-3.5" /> {t('settings.title')}
          </div>
          <h1 className="text-xl font-extrabold text-white">{t('settings.title')}</h1>
        </div>
        {onClose && (
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            {t('common.close')}
          </button>
        )}
      </div>

      {/* Theme */}
      <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">{t('settings.appearance')}</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{t('settings.theme')}</span>
          <div className="flex gap-1">
            {['dark', 'light'].map(t_opt => (
              <button
                key={t_opt}
                onClick={() => updateSetting('theme', t_opt)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                  settings.theme === t_opt ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t_opt === 'dark' ? t('settings.dark') : t('settings.light')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Video Quality */}
      <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Monitor className="w-4 h-4 text-blue-400" /> {t('settings.video')}</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{t('settings.default_quality')}</span>
          <select
            value={settings.defaultQuality}
            onChange={e => updateSetting('defaultQuality', e.target.value)}
            className="bg-slate-800 text-xs text-slate-200 px-2 py-1 rounded-lg border border-slate-700"
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
            className="bg-slate-800 text-xs text-slate-200 w-16 text-center px-2 py-1 rounded-lg border border-slate-700"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{t('settings.auto_next')}</span>
          <button
            onClick={() => updateSetting('autoNextOn', !settings.autoNextOn)}
            className={`w-10 h-5 rounded-full transition-all ${settings.autoNextOn ? 'bg-red-600' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.autoNextOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {device.isMobile && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.gesture')}</span>
            <button
              onClick={() => updateSetting('gestureEnabled', !settings.gestureEnabled)}
              className={`w-10 h-5 rounded-full transition-all ${settings.gestureEnabled ? 'bg-red-600' : 'bg-slate-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.gestureEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}
      </div>

      {/* Parental Control */}
      <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Shield className="w-4 h-4 text-amber-400" /> {t('settings.parental')}</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{t('settings.parental_enable')}</span>
          <button
            onClick={() => updateSetting('parentalEnabled', !settings.parentalEnabled)}
            className={`w-10 h-5 rounded-full transition-all ${settings.parentalEnabled ? 'bg-red-600' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.parentalEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
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
                className="bg-slate-800 text-xs text-slate-200 w-28 px-2 py-1 rounded-lg border border-slate-700 pr-7"
              />
              <button onClick={() => setShowPin(!showPin)} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5">
                {showPin ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-slate-400" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EPG & Sources */}
      <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Globe className="w-4 h-4 text-emerald-400" /> {t('settings.data_sources')}</h3>
        <div className="space-y-2">
          <label className="text-xs text-slate-400 block">{t('settings.epg_url')}</label>
          <input
            type="url"
            value={settings.epgSource}
            onChange={e => updateSetting('epgSource', e.target.value)}
            placeholder="https://epg.io.vn/epgc.xml"
            className="w-full bg-slate-800 text-xs text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700"
          />
        </div>
      </div>

      {/* Reset */}
      <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-4">
        <button
          onClick={handleReset}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            showConfirm ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
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
  );
}