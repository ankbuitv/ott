import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchComments, postComment, deleteComment } from '../services/social';

// Bình luận cho phim/kênh (target = 'movie-123' | 'ch-VTV1.vn')
export default function CommentsBox({ target }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let on = true;
    if (target) fetchComments(target).then(c => { if (on) setList(c); }).catch(() => {});
    return () => { on = false; };
  }, [target]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (!isAuthenticated) { addToast(t('cmt.need_login'), 'info'); return; }
    setSending(true);
    try {
      const r = await postComment(target, body);
      setList([{ id: r.id || Date.now(), user_id: user?.id, name: user?.display_name || user?.username, body, created_at: new Date().toISOString() }, ...list]);
      setText('');
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('cmt.need_login') : t('cmt.fail'), 'error');
    } finally { setSending(false); }
  };
  const del = async (id) => {
    try { await deleteComment(id); setList(list.filter(c => c.id !== id)); }
    catch { addToast(t('cmt.del_fail'), 'error'); }
  };

  return (
    <div className="mt-6">
      <h4 className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5" />{t('cmt.title')} {list.length > 0 && <span className="text-stone-600">({list.length})</span>}
      </h4>
      <div className="flex gap-2 mb-3">
        <input
          value={text} onChange={e => setText(e.target.value.slice(0, 500))}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder={t('cmt.ph')}
          className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-[12px] text-white placeholder:text-stone-600 focus:outline-none focus:border-[#f36f21]"
        />
        <button onClick={send} disabled={sending || !text.trim()} className="px-3.5 rounded-xl grad-brand text-white disabled:opacity-40 active:scale-95">
          <Send className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2 max-h-[260px] overflow-y-auto">
        {list.length === 0 && <p className="text-[11px] text-stone-600 italic">{t('cmt.empty')}</p>}
        {list.map(c => (
          <div key={c.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-[#ffb37a] truncate">{c.name || '?'}</p>
              {(user?.id === c.user_id || user?.role === 'admin') && (
                <button onClick={() => del(c.id)} className="text-stone-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
            <p className="text-[12px] text-slate-200 leading-snug break-words">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
