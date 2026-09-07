import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useProfile } from './ProfileContext';

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
  colorTheme: 'sunset',
  tvMode: false,
  spoilerMask: false,
  dataSaver: false,
  dataSaverCap: 480,
  autoQualityOnCellular: true, // (13) tự hạ chất lượng khi mạng yếu / 4G
  upstreamUA: 'dalvik',        // UA gửi lên nguồn khi phát qua proxy: dalvik | chrome | auto
  kidBedtimeEnabled: false,
  kidBedtimeStart: '21:00',
  kidBedtimeEnd: '06:00',
};

// (#16) Nhóm "player" được lưu RIÊNG theo từng profile (đổi hồ sơ là đổi
// chất lượng/data-saver/thao tác mà không đụng hồ sơ khác). Các mục còn lại
// (giao diện, ngôn ngữ, nguồn EPG/M3U…) giữ chung theo thiết bị.
const PLAYER_PREFS = new Set([
  'defaultQuality', 'bufferGoal', 'rebufferingGoal', 'bufferBehind',
  'autoNextOn', 'showStats', 'gestureEnabled', 'spoilerMask',
  'dataSaver', 'dataSaverCap', 'autoQualityOnCellular', 'sleepTimerMinutes', 'upstreamUA',
]);

const SettingsContext = createContext(null);

function readBase() {
  try {
    const saved = localStorage.getItem('chrtv_settings');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}
function readOverlay(profileId) {
  if (!profileId) return {};
  try {
    const saved = localStorage.getItem(`chrtv_settings_p${profileId}`);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function SettingsProvider({ children }) {
  const { currentProfile } = useProfile();
  const profileId = currentProfile?.id || null;
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...readBase(),
    ...readOverlay(currentProfile?.id || null),
  }));

  // Đổi profile: áp lớp overlay của profile mới. Profile chưa từng được chỉnh
  // (overlay rỗng) — kể cả khi thoát về khách — sẽ kế thừa cài đặt thiết bị
  // (base) thay vì giữ nguyên setting của profile cũ.
  const [prevProfile, setPrevProfile] = useState(profileId);
  useEffect(() => {
    if (prevProfile === profileId) return;
    setPrevProfile(profileId);
    const ov = readOverlay(profileId || null);
    setSettings(prev => ({ ...prev, ...(Object.keys(ov).length ? ov : readBase()) }));
  }, [profileId, prevProfile]);

  // Lưu: player-prefs → overlay profile; còn lại → base chung.
  useEffect(() => {
    try {
      const base = readBase();
      const overlay = readOverlay(profileId || null);
      for (const [k, v] of Object.entries(settings)) {
        if (PLAYER_PREFS.has(k)) overlay[k] = v;
        else base[k] = v;
      }
      localStorage.setItem('chrtv_settings', JSON.stringify(base));
      if (profileId) localStorage.setItem(`chrtv_settings_p${profileId}`, JSON.stringify(overlay));
    } catch {}
  }, [settings, profileId]);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      if (profileId) localStorage.removeItem(`chrtv_settings_p${profileId}`);
    } catch {}
  }, [profileId]);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
