import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translate, LANGUAGES, detectLang } from '../i18n/translations';

const STORAGE_KEY = 'chrtv_lang';
const PICKER_SHOWN = 'chrtv_lang_picker_shown';
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  // Ưu tiên: localStorage → detectLang → 'en'
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGUAGES.find(l => l.code === saved)) return saved;
    } catch {}
    return detectLang();
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  }, [lang]);

  const t = useCallback((key, params) => {
    let s = translate(key, lang);
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{{${k}}}`, v);
    return s;
  }, [lang]);

  // Helpers cho LanguagePicker
  const hasPicked = useCallback(() => {
    try { return !!localStorage.getItem(PICKER_SHOWN); } catch { return false; }
  }, []);
  const markPicked = useCallback(() => {
    try { localStorage.setItem(PICKER_SHOWN, '1'); } catch {}
  }, []);
  const resetPicker = useCallback(() => {
    try { localStorage.removeItem(PICKER_SHOWN); } catch {}
  }, []);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, languages: LANGUAGES, hasPicked, markPicked, resetPicker, detectedLang: detectLang() }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
