import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import translations from '../i18n/translations';
const I18nContext = createContext({ t: s=>s, hasPicked: ()=>true, resetPicker: ()=>{}, lang:'vi', setLang: ()=>{} });
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(()=>localStorage.getItem('chrtv_lang')||'vi');
  const setLang = useCallback((l)=>{ localStorage.setItem('chrtv_lang',l); localStorage.setItem('chrtv_lang_picked','1'); setLangState(l); },[]);
  const hasPicked = useCallback(()=>!!localStorage.getItem('chrtv_lang_picked'),[]);
  const resetPicker = useCallback(()=>localStorage.removeItem('chrtv_lang_picked'),[]);
  const t = useCallback((key)=>translations[lang]?.[key]||translations.en?.[key]||key, [lang]);
  const value = useMemo(()=>({t,hasPicked,resetPicker,lang,setLang}),[t,hasPicked,resetPicker,lang,setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export const useI18n = () => useContext(I18nContext);