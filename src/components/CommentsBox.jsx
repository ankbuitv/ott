import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Trash2, Mic, Square, MapPin, Volume2, Pin } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchComments, postComment, deleteComment } from '../services/social';
import { useVoiceComment, fmtTstamp } from './Pack48Ui';

/**
 * Bình luận cho phim/kênh/short (target = 'movie-123' | 'ch-VTV1.vn' | 'short-7').
 * Đợt 48:
 *  - (#9) Bình luận gắn phút: tstamp (giây) — bấm chip để tua đúng phút (nếu có onJump).
 *  - (#68) Voice-note: ghi âm tối đa ~30s, gửi kèm dataURL nhỏ (client nén/giới hạn 500KB).
 *  - (#39) Bình luận được admin ghim (pinned) hiện trước.
 */
export default function CommentsBox({ target, initialTstamp = null, onJump = null, title = null, variant = 'full', onCount = null }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated, user } = useAuth();
  // variant="short": bảng bình luận trong Shorts — bỏ ghim phút & voice-note cho gọn
  const isShort = variant === 'short';
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pinMin, setPinMin] = useState(() => (Number.isFinite(Number(initialTstamp)) && Number(initialTstamp) >= 0 ? Math.floor(Number(initialTstamp)) : null));
  const rec = useVoiceComment();
  // lắng nghe initialTstamp đổi (player đang tua/chạy)
  const lastInit = useRef(initialTstamp);
  useEffect(() => {
    if (initialTstamp !== lastInit.current) {
      lastInit.current = initialTstamp;
      if (Number.isFinite(Number(initialTstamp)) && Number(initialTstamp) >= 0 && pinMin === null) setPinMin(Math.floor(Number(initialTstamp)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTstamp]);

  useEffect(() => {
    let on = true;
    if (target) fetchComments(target).then(c => { if (on) setList(c); }).catch(() => {});
    return () => { on = false; };
  }, [target]);

  // Báo số lượng bình luận ra ngoài (vd: đếm trên nút 💬 của short)
  useEffect(() => { if (onCount) onCount(list.length); }, [list.length, onCount]);

  const buildComment = (body, id) => ({
    id: id || Date.now() + Math.floor(Math.random() * 999),
    user_id: user?.id,
    name: user?.display_name || user?.username || 'Bạn',
    body,
    tstamp: pinMin,
    kind: rec.rec.dataUrl ? 'voice' : 'comment',
    voice_url: rec.rec.dataUrl || '',
    created_at: new Date().toISOString(),
  });

  const send = async () => {
    const body = text.trim();
    if (!body && !rec.rec.dataUrl) return;
    if (!isAuthenticated) { addToast(t('cmt.need_login'), 'info'); return; }
    setSending(true);
    try {
      const caption = body || '🎙️ Ghi chú thoại';
      const r = await postComment(target, caption, {
        tstamp: pinMin ?? -1,
        voice_url: rec.rec.dataUrl || '',
        kind: rec.rec.dataUrl ? 'voice' : 'comment',
      });
      setList([buildComment(caption, r?.id || 0), ...list]);
      setText('');
      rec.clear();
      if (rec.rec.dataUrl) addToast('🎙️ Đã gửi voice-note!', 'success');
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('cmt.need_login') : t('cmt.fail'), 'error');
    } finally { setSending(false); }
  };
  const del = async (id) => {
    try { await deleteComment(id); setList(list.filter(c => c.id !== id)); }
    catch { addToast(t('cmt.del_fail'), 'error'); }
  };
  const jump = (sec) => { if (onJump && Number.isFinite(sec) && sec >= 0) onJump(sec); };

  return (
    <div className="mt-6">
      <h4 className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5" />{title || t('cmt.title')} {list.length > 0 && <span className="text-stone-600">({list.length})</span>}
        {onJump && <span className="ml-auto normal-case tracking-normal text-[9px] text-stone-600 flex items-center gap-1"><MapPin className="w-3 h-3" />bấm giờ để tua phim</span>}
      </h4>
      <div className="flex gap-2 mb-2">
        <input
          value={text} onChange={e => setText(e.target.value.slice(0, 500))}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder={t('cmt.ph')}
          className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-[12px] text-white placeholder:text-stone-600 focus:outline-none focus:border-[#f36f21]"
        />
        {!isShort && (
          <button onClick={() => setPinMin(pinMin === null ? 0 : null)} title="Ghim kèm phút đang xem" className={`px-2.5 rounded-xl border text-[10px] font-black flex items-center gap-1 ${pinMin !== null ? 'bg-[#ff9a3d]/20 border-[#ff9a3d]/50 text-[#ffb37a]' : 'bg-black/30 border-white/10 text-stone-500 hover:text-white'}`}>
            <MapPin className="w-3.5 h-3.5" />
            {pinMin !== null ? fmtTstamp(pinMin) : 'phút'}
          </button>
        )}
        <button onClick={send} disabled={sending || (!text.trim() && !rec.rec.dataUrl)} className="px-3.5 rounded-xl grad-brand text-white disabled:opacity-40 active:scale-95">
          <Send className="w-4 h-4" />
        </button>
      </div>
      {!isShort && pinMin !== null && !rec.rec.on && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-[#ff9a3d]/10 border border-[#ff9a3d]/25 text-[11px] text-[#ffd9b3]">
          <MapPin className="w-3.5 h-3.5" /> Bình luận sẽ ghim vào <b className="font-mono">{fmtTstamp(pinMin)}</b>
          {onJump && <button onClick={() => jump(pinMin)} className="ml-auto px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-bold">Xem lại lúc này</button>}
          <button onClick={() => setPinMin(null)} className="px-1.5 text-stone-400 hover:text-white text-[10px] font-bold">Bỏ</button>
        </div>
      )}
      {/* Voice-note recorder (bỏ ở Shorts cho gọn) */}
      <div className="mb-2" hidden={isShort} style={isShort ? { display: 'none' } : undefined}>
        {rec.rec.on ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-[12px] font-bold">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Đang ghi… {rec.rec.seconds}s / 30s
            <button onClick={rec.stop} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-black"><Square className="w-3 h-3" />Dừng</button>
          </div>
        ) : rec.rec.dataUrl ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/25 text-emerald-200 text-[12px]">
            <Volume2 className="w-4 h-4 text-emerald-400" /> Voice-note {rec.rec.seconds > 0 ? `${rec.rec.seconds}s` : 'đã ghi'} — viết caption rồi Gửi
            <audio controls src={rec.rec.dataUrl} className="h-7 ml-auto" preload="none" />
            <button onClick={rec.clear} className="px-1.5 text-stone-400 hover:text-white text-[10px] font-bold">Bỏ</button>
          </div>
        ) : (
          <button onClick={rec.start} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-stone-300 hover:border-rose-400/40 hover:text-rose-200">
            <Mic className="w-3.5 h-3.5" /> Ghi chú thoại
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-[280px] overflow-y-auto">
        {list.length === 0 && <p className="text-[11px] text-stone-600 italic">{t('cmt.empty')}</p>}
        {list.map(c => {
          const tst = Number(c.tstamp);
          const minuteCmt = Number.isFinite(tst) && tst >= 0;
          const isVoice = c.kind === 'voice' || !!c.voice_url;
          const isMine = isAuthenticated && user && Number(c.user_id) === Number(user.id);
          return (
            <div key={c.id} className={`rounded-xl border px-3 py-2 ${c.pinned ? 'bg-amber-500/[0.06] border-amber-500/20' : 'bg-white/[0.04] border-white/[0.06]'} ${isVoice ? 'border-emerald-500/20' : ''}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-black text-stone-300 truncate">{c.name || 'Bạn xem'}</span>
                {minuteCmt && onJump ? (
                  <button onClick={() => jump(tst)} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#ff9a3d]/15 text-[#ffb37a] font-mono text-[10px] font-black hover:bg-[#ff9a3d]/30"><MapPin className="w-2.5 h-2.5" />{fmtTstamp(tst)}</button>
                ) : minuteCmt && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#ff9a3d]/15 text-[#ffb37a] font-mono text-[10px] font-black"><MapPin className="w-2.5 h-2.5 inline" /> {fmtTstamp(tst)}</span>
                )}
                {!!c.pinned && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[9px] font-black"><Pin className="w-2.5 h-2.5" />GHIM</span>}
                {isVoice && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[9px] font-black"><Mic className="w-2.5 h-2.5" />GIỌNG NÓI</span>}
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-[9px] text-stone-600">{(c.created_at || '').toString().slice(0, 10)}</span>
                  {isMine && <button onClick={() => del(c.id)} className="text-stone-600 hover:text-rose-400"><Trash2 className="w-3 h-3" /></button>}
                </span>
              </div>
              {isVoice && c.voice_url ? (
                <audio controls src={c.voice_url} className="w-full h-8 mt-0.5" preload="none" />
              ) : null}
              {c.body && c.body !== '🎙️ Ghi chú thoại' && <p className="text-[12px] text-stone-300 leading-relaxed break-words mt-0.5">{c.body}</p>}
              {isVoice && !c.body && <p className="text-[11px] text-stone-500 italic mt-0.5">Voice-note</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
