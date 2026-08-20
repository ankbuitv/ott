import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertTriangle, Info, X, Volume2, Radio } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_ICONS = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
  volume: Volume2,
  channel: Radio,
};

const TOAST_COLORS = {
  success: 'bg-emerald-600/90',
  error: 'bg-red-600/90',
  info: 'bg-slate-700/90',
  volume: 'bg-slate-700/90',
  channel: 'bg-blue-600/90',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const addToast = useCallback((message, type = 'info', duration = 2500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);

    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-xs">
        {toasts.map(toast => {
          const Icon = TOAST_ICONS[toast.type] || Info;
          const color = TOAST_COLORS[toast.type] || TOAST_COLORS.info;
          return (
            <div
              key={toast.id}
              className={`${color} backdrop-blur-md text-white px-3 py-2 rounded-xl shadow-xl flex items-center gap-2 pointer-events-auto animate-[slideInRight_0.2s_ease-out]`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium flex-1">{toast.message}</span>
              <button onClick={() => removeToast(toast.id)} className="p-0.5 hover:bg-white/20 rounded-full">
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
