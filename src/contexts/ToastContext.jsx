import React, { createContext, useContext, useState, useCallback } from 'react';
const ToastContext = createContext({ addToast: () => {} });
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg,type='info') => {
    const id=Date.now(); setToasts(prev=>[...prev,{id,msg,type}]);
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),3000);
  },[]);
  return <ToastContext.Provider value={{ addToast, toasts }}>
    {children}
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] space-y-2">
      {toasts.map(t=><div key={t.id} className={`px-4 py-2 rounded-xl text-sm font-bold shadow-2xl backdrop-blur ${t.type==='error'?'bg-red-600 text-white':t.type==='success'?'bg-emerald-600 text-white':'bg-black/80 text-white border border-slate-700'}`}>{t.msg}</div>)}
    </div>
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);