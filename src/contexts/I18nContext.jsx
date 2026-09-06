import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translate, LANGUAGES, detectLang, detectCountry } from '../i18n/translations';
import { resolveCountry } from '../services/geo';

const STORAGE_KEY = 'chrtv_lang';
const PICKER_SHOWN = 'chrtv_lang_picker_shown';
const I18nContext = createContext(null);

// Map country -> lang code
function countryToLang(cc) {
  const m = {
    VN: 'vi',
    PH: 'fil',
    CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh',
    FR: 'fr', BE: 'fr', CH: 'fr', CA: 'en',
    JP: 'ja',
    KR: 'ko',
    TH: 'th',
    ID: 'id',
    MY: 'ms',
    IN: 'hi',
    DE: 'de', AT: 'de',
    ES: 'es', MX: 'es', AR: 'es',
    PT: 'pt', BR: 'pt',
    RU: 'ru',
  };
  return m[cc] || null;
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGUAGES.find(l => l.code === saved)) return saved;
      // quick sync detection: check geo cache if exists
      try {
        const raw = localStorage.getItem('chrtv_geo_country');
        if (raw) {
          const { cc } = JSON.parse(raw);
          const mapped = countryToLang((cc || '').toUpperCase());
          if (mapped && LANGUAGES.find(l => l.code === mapped)) return mapped;
        }
      } catch {}
    } catch {}
    return detectLang();
  });

  // Auto language by geo on first visit — resolve IP geo then switch language if user hasn't picked manually
  useEffect(() => {
    let alive = true;
    try {
      // If user already picked language (has PICKER_SHOWN) or has saved lang, don't auto-switch
      const hasSaved = !!localStorage.getItem(STORAGE_KEY);
      const hasPicked = !!localStorage.getItem(PICKER_SHOWN);
      if (hasSaved && hasPicked) return;
    } catch {}
    resolveCountry().then(cc => {
      if (!alive || !cc) return;
      const mapped = countryToLang(cc.toUpperCase());
      if (!mapped) return;
      if (!LANGUAGES.find(l => l.code === mapped)) return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        // Only auto if no saved or saved equals detected default
        if (!saved || saved === detectLang()) {
          setLang(mapped);
          localStorage.setItem(STORAGE_KEY, mapped);
          // Mark picker as shown automatically — user requested no welcome popup
          localStorage.setItem(PICKER_SHOWN, '1');
        }
      } catch {}
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  }, [lang]);

  const t = useCallback((key, params) => {
    let s = translate(key, lang);
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{{${k}}}`, v);
    return s;
  }, [lang]);

  const hasPicked = useCallback(() => {
    try { return !!localStorage.getItem(PICKER_SHOWN); } catch { return true; }
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
