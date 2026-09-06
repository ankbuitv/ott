import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, Keyboard, CheckCircle2 } from 'lucide-react';
import jsQR from 'jsqr';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';
import { API_BASE } from '../services/config';

// Quét mã QR đăng nhập từ thiết bị khác (camera) hoặc nhập tay mã 6 ký tự
export default function QrScanner({ onClose }) {
  const { t } = useI18n();
  const { token } = useAuth();
  const { addToast } = useToast();
  const [mode, setMode] = useState('camera'); // camera | manual
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [camErr, setCamErr] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const approvedRef = useRef(false);

  const approve = useCallback(async (raw) => {
    if (approvedRef.current || busy) return;
    const m = String(raw || '').trim().toUpperCase().match(/([A-Z0-9]{6})/);
    if (!m) return;
    approvedRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/auth/qr/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: m[1] }),
      });
      const d = await r.json();
      if (d.success) {
        setDone(true);
        addToast(t('qr.approved'), 'success');
      } else {
        addToast(d.error || t('qr.failed'), 'error');
        approvedRef.current = false;
      }
    } catch {
      addToast(t('qr.failed'), 'error');
      approvedRef.current = false;
    } finally {
      setBusy(false);
    }
  }, [token, busy, addToast, t]);

  // Camera loop
  useEffect(() => {
    if (mode !== 'camera' || done) return undefined;
    let alive = true;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_CAM');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!alive) { stream.getTracks().forEach(tr => tr.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (!alive || approvedRef.current) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            try {
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(img.data, img.width, img.height);
              if (code?.data) approve(code.data);
            } catch {}
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (alive) setCamErr(t('qr.nocam'));
      }
    };
    start();
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null; }
    };
  }, [mode, done, approve, t]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            📷 {t('qr.title')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-stone-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-bold text-white">{t('qr.approved')}</p>
            <p className="text-xs text-stone-500 mt-1">{t('qr.approved_sub')}</p>
            <button onClick={onClose} className="mt-5 px-6 py-2.5 btn-orange text-white text-sm font-bold rounded-2xl">
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex bg-white/5 rounded-xl p-1 mb-4 border border-white/10">
              <button onClick={() => setMode('camera')} className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 ${mode === 'camera' ? 'grad-brand text-white' : 'text-stone-400'}`}>
                <Camera className="w-3.5 h-3.5" /> {t('qr.camera')}
              </button>
              <button onClick={() => setMode('manual')} className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 ${mode === 'manual' ? 'grad-brand text-white' : 'text-stone-400'}`}>
                <Keyboard className="w-3.5 h-3.5" /> {t('qr.manual')}
              </button>
            </div>

            {mode === 'camera' ? (
              <div>
                {camErr ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-stone-400 mb-3">{camErr}</p>
                    <button onClick={() => setMode('manual')} className="px-5 py-2.5 bg-white/10 text-white text-xs font-bold rounded-xl">
                      {t('qr.manual')}
                    </button>
                  </div>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                    <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                    {/* khung ngắm */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-52 h-52 rounded-2xl border-2 border-[#f36f21]/80 shadow-[0_0_0_9999px_rgba(0,0,0,.55)]">
                        <div className="w-full h-0.5 bg-[#f36f21] anim-scan"></div>
                      </div>
                    </div>
                    <p className="absolute bottom-3 inset-x-0 text-center text-[11px] text-white/80">{t('qr.aim')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-stone-400">{t('qr.manual_help')}</p>
                <input
                  value={manual}
                  onChange={e => setManual(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="XXXXXX"
                  className="w-full px-3 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-xl font-mono font-black tracking-[0.4em] text-center text-white placeholder:text-stone-600 focus:outline-none focus:border-[#f36f21]"
                />
                <button
                  onClick={() => approve(manual)}
                  disabled={busy || manual.length !== 6}
                  className="w-full py-3 btn-orange text-white text-sm font-bold rounded-2xl disabled:opacity-50"
                >
                  {busy ? t('app.loading') : t('qr.approve_btn')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
