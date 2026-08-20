import React, { useState, useEffect } from 'react';
import { Megaphone, X } from 'lucide-react';

const BASE = window.location.origin;

export default function BroadcastBanner() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    fetch(`${BASE}/api/broadcasts`).then(r => r.json()).then(d => {
      if (d.broadcasts) setBroadcasts(d.broadcasts);
    }).catch(() => {});
  }, []);

  const visible = broadcasts.filter(b => !dismissed.has(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-1">
      {visible.map(b => (
        <div key={b.id} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium ${
          b.type === 'warning' ? 'bg-amber-600/20 text-amber-300 border border-amber-600/30' :
          b.type === 'event' ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30' :
          'bg-slate-800/60 text-slate-300 border border-slate-700/30'
        }`}>
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{b.message}</span>
          <button onClick={() => setDismissed(prev => new Set([...prev, b.id]))} className="p-0.5 hover:bg-black/30 rounded shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
