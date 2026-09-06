import React, { useState } from 'react';
import { Share2, Copy, Check, MessageCircle } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';

// Nút chia sẻ dùng chung: native share + Facebook + Zalo + copy link
export default function ShareButtons({ url, title = '', compact = false }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);
  const link = url || (typeof window !== 'undefined' ? window.location.href : '');
  const text = title || t('share.default_text');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = link; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      } catch {}
    }
    setCopied(true);
    addToast(t('share.copied'), 'success');
    setTimeout(() => setCopied(false), 2000);
  };
  const native = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: text, url: link }); return; }
    } catch {}
    copy();
  };
  const fb = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank', 'noopener,width=600,height=500');
  const zalo = () => window.open(`https://zalo.me/share?url=${encodeURIComponent(link)}`, '_blank', 'noopener,width=600,height=500');

  const btn = 'flex items-center justify-center gap-1.5 rounded-xl font-bold transition-all active:scale-95 ';
  const size = compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-[12px]';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={native} className={btn + size + 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/25 hover:brightness-110'}>
        <Share2 className="w-3.5 h-3.5" />{!compact && t('share.share')}
      </button>
      <button onClick={fb} title="Facebook" className={btn + size + 'bg-[#1877F2]/15 text-[#7fb3ff] border border-[#1877F2]/40 hover:bg-[#1877F2]/25'}>
        <span className="w-3.5 h-3.5 flex items-center justify-center font-black text-[13px] leading-none">f</span>{!compact && 'Facebook'}
      </button>
      <button onClick={zalo} title="Zalo" className={btn + size + 'bg-sky-500/15 text-sky-300 border border-sky-500/40 hover:bg-sky-500/25'}>
        <MessageCircle className="w-3.5 h-3.5" />{!compact && 'Zalo'}
      </button>
      <button onClick={copy} title={t('share.copy')} className={btn + size + 'bg-white/[0.06] text-stone-300 border border-white/10 hover:bg-white/[0.12]'}>
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}{!compact && t('share.copy')}
      </button>
    </div>
  );
}

export function buildDeepLink(params) {
  try {
    const u = new URL(window.location.origin + window.location.pathname);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  } catch { return window.location.href; }
}
