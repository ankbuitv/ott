import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, X, Clock } from 'lucide-react';

export default function SleepTimer({ onExpired, onClose }) {
  const [minutes, setMinutes] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  const startTimer = useCallback((mins) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = mins * 60 * 1000;
    const endTime = Date.now() + ms;
    setRemaining(ms);
    setMinutes(mins);

    intervalRef.current = setInterval(() => {
      const left = endTime - Date.now();
      if (left <= 0) {
        clearInterval(intervalRef.current);
        setRemaining(0);
        onExpired && onExpired();
      } else {
        setRemaining(left);
      }
    }, 1000);

    timerRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      onExpired && onExpired();
    }, ms);
  }, [onExpired]);

  const cancelTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(0);
    setMinutes(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatRemaining = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="bg-black/80 backdrop-blur-md rounded-xl border border-slate-700/50 p-3 w-56 shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
          <Timer className="w-3.5 h-3.5 text-amber-400" /> Hẹn giờ tắt
        </div>
        {remaining > 0 && (
          <button onClick={cancelTimer} className="p-0.5 hover:bg-slate-700 rounded">
            <X className="w-3 h-3 text-slate-400" />
          </button>
        )}
      </div>

      {remaining > 0 ? (
        <div className="text-center py-2">
          <div className="text-2xl font-mono font-bold text-amber-400">{formatRemaining(remaining)}</div>
          <p className="text-[10px] text-slate-500 mt-1">Tự tắt sau {minutes} phút</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {[15, 30, 60, 90, 120, 0].map(m => (
            <button
              key={m}
              onClick={() => m === 0 ? cancelTimer() : startTimer(m)}
              className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
            >
              {m === 0 ? 'Tắt' : `${m}p`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
