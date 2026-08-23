import React, { useCallback } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { Globe, Check, ChevronRight } from 'lucide-react';

const languages = [
  { code: 'vi', name: 'Tiếng Việt', country: 'Việt Nam', flag: '🇻🇳' },
  { code: 'fil', name: 'Filipino', country: 'Pilipinas', flag: '🇵🇭' },
  { code: 'zh', name: '中文', country: '中国', flag: '🇨🇳' },
  { code: 'en', name: 'English', country: 'International', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', country: 'France', flag: '🇫🇷' },
];

export default function LanguagePicker({ onClose }) {
  const { lang, setLang } = useI18n();

  const handleSelect = useCallback((code) => {
    setLang(code);
    if (onClose) onClose();
  }, [setLang, onClose]);

  const suggested = languages.slice(0, 4);
  const auto = languages.slice(4, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#0d0e12] to-[#111318] flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-red-600/30">
            <Globe className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-1">Choose your language</h1>
          <p className="text-slate-400 text-sm">You can change this anytime</p>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            🌍 Suggested for your region
          </p>
          <div className="grid grid-cols-2 gap-3">
            {suggested.map((l) => (
              <button
                key={l.code}
                onClick={() => handleSelect(l.code)}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left ${
                  lang === l.code
                    ? 'border-red-500 bg-red-600/10 shadow-lg shadow-red-600/10'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-500/50 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{l.flag}</span>
                  <div>
                    <p className="text-sm font-bold text-white">{l.name}</p>
                    <p className="text-xs text-slate-400">{l.country}</p>
                  </div>
                </div>
                {lang === l.code && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">AUTO</p>
          <div className="flex gap-3">
            {auto.map((l) => (
              <button
                key={l.code}
                onClick={() => handleSelect(l.code)}
                className={`shrink-0 p-4 rounded-2xl border-2 transition-all ${
                  lang === l.code
                    ? 'border-red-500 bg-red-600/10'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-500/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{l.flag}</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">{l.name}</p>
                    <p className="text-xs text-slate-400">{l.country}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => handleSelect(lang)}
          className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl transition-all shadow-xl shadow-red-600/20 hover:shadow-red-600/30 flex items-center justify-center gap-2"
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}