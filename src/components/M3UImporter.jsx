import React, { useState } from 'react';
import { Upload, Link, Trash2, Plus, Check, AlertCircle, FileText } from 'lucide-react';
import { getCustomM3uSources, setCustomM3uSources } from '../hooks/useStorage';

export default function M3UImporter({ onImport, onClose }) {
  const [sources, setSources] = useState(getCustomM3uSources());
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const addSource = () => {
    if (!newUrl.trim()) return;
    const src = { id: Date.now(), name: newName.trim() || 'M3U Custom', url: newUrl.trim(), added: new Date().toISOString() };
    const updated = [...sources, src];
    setSources(updated);
    setCustomM3uSources(updated);
    setNewUrl('');
    setNewName('');
  };

  const removeSource = (id) => {
    const updated = sources.filter(s => s.id !== id);
    setSources(updated);
    setCustomM3uSources(updated);
  };

  const importFromUrl = async (src) => {
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(src.url, { headers: { 'User-Agent': 'CHRTV-OTT/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const channels = parseM3UFromText(text);
      setResult({ success: true, count: channels.length, name: src.name });
      if (onImport && channels.length > 0) onImport(channels);
    } catch (e) {
      setResult({ success: false, error: e.message, name: src.name });
    }
    setImporting(false);
  };

  const parseM3UFromText = (text) => {
    const lines = text.split(/\r?\n/);
    const channels = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        current = {};
        const idM = line.match(/tvg-id="([^"]+)"/i);
        current.channel_id = idM ? idM[1] : `custom_${channels.length + 1}`;
        const nameM = line.match(/tvg-name="([^"]+)"/i);
        const cIdx = line.lastIndexOf(',');
        current.name = nameM ? nameM[1] : (cIdx !== -1 ? line.substring(cIdx + 1).trim() : `Kênh ${channels.length + 1}`);
        const logoM = line.match(/tvg-logo="([^"]+)"/i);
        current.logo = logoM ? logoM[1] : '';
        const grpM = line.match(/group-title="([^"]+)"/i);
        current.group_title = grpM ? grpM[1] : 'Import';
        current.catchup_type = 'append';
        current.catchup_days = 7;
      } else if (line && !line.startsWith('#') && current) {
        current.stream_url = line;
        channels.push(current);
        current = null;
      }
    }
    return channels;
  };

  return (
    <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Upload className="w-4 h-4 text-blue-400" /> Nhập M3U
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[10px] text-slate-500 hover:text-white">Đóng</button>
        )}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Tên playlist (tùy chọn)"
          className="w-full bg-slate-800/60 text-xs text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700/50"
        />
        <div className="flex gap-2">
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="https://example.com/playlist.m3u"
            className="flex-1 bg-slate-800/60 text-xs text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700/50"
            onKeyDown={e => e.key === 'Enter' && addSource()}
          />
          <button
            onClick={addSource}
            disabled={!newUrl.trim()}
            className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm
          </button>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {sources.map(src => (
            <div key={src.id} className="flex items-center gap-2 bg-slate-900/60 rounded-lg p-2 border border-slate-800/30">
              <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-slate-200 truncate">{src.name}</p>
                <p className="text-[9px] text-slate-500 truncate font-mono">{src.url}</p>
              </div>
              <button
                onClick={() => importFromUrl(src)}
                disabled={importing}
                className="px-2 py-1 bg-emerald-600/20 text-emerald-400 text-[10px] font-semibold rounded hover:bg-emerald-600/30 transition-all flex items-center gap-0.5"
              >
                <Upload className="w-3 h-3" /> Import
              </button>
              <button onClick={() => removeSource(src.id)} className="p-1 hover:bg-red-600/20 rounded">
                <Trash2 className="w-3 h-3 text-slate-500 hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className={`text-[11px] px-3 py-2 rounded-lg flex items-center gap-1.5 ${
          result.success ? 'bg-emerald-600/15 text-emerald-400' : 'bg-red-600/15 text-red-400'
        }`}>
          {result.success
            ? <><Check className="w-3.5 h-3.5" /> {result.name}: {result.count} kênh đã import</>
            : <><AlertCircle className="w-3.5 h-3.5" /> {result.name}: {result.error}</>
          }
        </div>
      )}
    </div>
  );
}
