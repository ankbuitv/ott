import React, { createContext, useContext, useState } from 'react';
const SettingsContext = createContext({ settings: {}, setSettings: () => {} });
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ theme: 'dark', parentalEnabled: false, hiddenGroups: [] });
  return <SettingsContext.Provider value={{ settings, setSettings }}>{children}</SettingsContext.Provider>;
}
export const useSettings = () => useContext(SettingsContext);