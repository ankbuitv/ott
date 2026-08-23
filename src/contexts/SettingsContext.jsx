import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  defaultQuality: 'auto',
  bufferGoal: 10,
  rebufferingGoal: 2,
  bufferBehind: 15,
  language: 'vi',
  parentalPin: '',
  parentalEnabled: false,
  hiddenGroups: [],
  autoNextOn: true,
  showStats: false,
  epgSource: 'https://epg.io.vn/epgc.xml',
  favoriteGroups: {},
  m3uSources: [],
  sleepTimerMinutes: 0,
  gestureEnabled: true,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('chrtv_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try { localStorage.setItem('chrtv_settings', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
