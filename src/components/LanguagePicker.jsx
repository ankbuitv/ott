import React, { useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

// Hiển thị màn hình chọn ngôn ngữ khi mở app lần đầu (hoặc khi reset)
export default function LanguagePicker({ onClose }) {
  const { languages, setLang, t, detectedLang, markPicked } = useI18n();
  const [selected, setSelected] = useState(detectedLang);

  const confirm = () => {
    setLang(selected);
    markPicked();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-br from-black via-[#0f1014] to-black flex items-center justify-center p-4 overflow-auto">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-red-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl bg-[#17181d] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-800 p-8 text-center">
          <Globe className="w-12 h-12 mx-auto text-white mb-3" />
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            {t('langpicker.title')}
          </h1>
          <p className="text-red-100 mt-2 text-sm">
            {t('langpicker.subtitle')}
          </p>
        </div>

        {/* Suggested badge */}
        <div className="px-6 pt-5">
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-3">
            {t('langpicker.suggest')}
          </div>
        </div>

        {/* Grid 5 ngôn ngữ */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {languages.map(l => {
              const isSelected = selected === l.code;
              const isDetected = detectedLang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => setSelected(l.code)}
                  className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                    isSelected
                      ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20 scale-105'
                      : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                  }`}
                >
                  <span className="text-4xl mb-2">{l.flag}</span>
                  <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-stone-300'}`}>{l.label}</span>
                  <span className={`text-[10px] mt-1 ${isSelected ? 'text-red-300' : 'text-stone-500'}`}>{l.country}</span>

                  {/* Selected check */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}

                  {/* Detected badge */}
                  {isDetected && (
                    <div className="absolute top-2 left-2 text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      AUTO
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Confirm */}
        <div className="px-6 pb-6">
          <button
            onClick={confirm}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-base shadow-lg shadow-red-600/30 transition-all active:scale-95"
          >
            {t('common.continue')} →
          </button>
        </div>
      </div>
    </div>
  );
}
