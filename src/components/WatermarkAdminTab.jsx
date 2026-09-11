import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Save, Upload, Trash2, Check, X, Sparkles, Eye, EyeOff, Layers, RefreshCw } from 'lucide-react';
import WatermarkStudio from './WatermarkStudio';
import { WM_DEFAULTS, WM_PAGE_LABEL, reloadWatermark } from '../services/watermark';
import { imageToSvg, fileToDataUrl, looksLikeSvg, fmtBytes } from '../utils/png2svg';

const inp = 'w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#f36f21]/50';
const btnP = 'px-3 py-2 bg-[#f36f21] hover:bg-[#e05f0f] text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none';
const btnG = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40';
const card = 'rounded-2xl border border-white/[0.07] bg-black/25 p-3.5';

async function api(BASE, headers, path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers, ...opts });
  return r.json().catch(() => ({}));
}

function Switch({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(checked ? 0 : 1)} className="flex items-start gap-2.5 text-left group">
      <span className={`mt-0.5 w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${checked ? 'bg-[#f36f21]' : 'bg-white/15'}`}>
        <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-slate-200 group-hover:text-white">{label}</span>
        {hint && <span className="block text-[10px] text-slate-500 leading-snug">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * Admin → "Logo khi phát": đặt logo watermark của web lên khung hình.
 * Cấu hình chung (áp mọi kênh) + tuỳ chỉnh riêng theo từng kênh bằng khung kéo.
 */
export default function WatermarkAdminTab({ BASE, headers, addToast }) {
  const [cfg, setCfg] = useState(null);
  const [logo, setLogo] = useState({ has_custom: false, bytes: 0 });
  const [overrides, setOverrides] = useState([]);
  const [groups, setGroups] = useState([]);
  const [all, setAll] = useState([]);
  const [total, setTotal] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [sel, setSel] = useState('');
  const [chDraft, setChDraft] = useState({});
  const chKeys = useRef(new Set());
  const [upSvg, setUpSvg] = useState('');
  const [upName, setUpName] = useState('');
  const [upNote, setUpNote] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const fileRef = useRef(null);

  const load = async () => {
    const d = await api(BASE, headers, '/admin/watermark');
    if (!d || !d.success) { addToast(d?.error || 'Không đọc được cấu hình (cần D1)', 'error'); return; }
    setCfg({ ...WM_DEFAULTS, ...d.config });
    setLogo(d.logo || { has_custom: false, bytes: 0 });
    setOverrides(d.channels || []);
    setGroups(d.groups || []);
    setTotal(d.total_channels || 0);
    const c = await api(BASE, headers, '/api/channels');
    setAll(c.channels || []);
    setDirty(false);
    setUrlDraft('');
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const ovByChannel = useMemo(() => {
    const m = new Map();
    for (const r of overrides) {
      try { m.set(r.channel_id, r.wm ? JSON.parse(r.wm) : null); } catch { m.set(r.channel_id, null); }
    }
    return m;
  }, [overrides]);

  const patch = (p) => { setCfg((c) => ({ ...c, ...p })); setDirty(true); };

  const saveGlobal = async () => {
    setBusy(true);
    const body = { ...cfg };
    delete body.version; delete body.updated_at;
    const d = await api(BASE, headers, '/admin/watermark', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (d.success) {
      addToast('Đã lưu logo watermark cho toàn hệ thống', 'success');
      if (d.config) setCfg({ ...WM_DEFAULTS, ...d.config });
      await reloadWatermark();
      setDirty(false);
    } else addToast(d.error || 'Lỗi khi lưu', 'error');
  };

  // ---------- logo: upload / chuyển PNG → SVG ----------
  const pickFile = async (f) => {
    if (!f) return;
    setUpName(f.name);
    setUpNote('');
    setBusy(true);
    try {
      if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') {
        const text = await f.text();
        if (!looksLikeSvg(text)) throw new Error('File không phải SVG hợp lệ');
        setUpSvg(text);
        setUpNote(`SVG ${fmtBytes(text.length)} — sẽ được làm sạch (bỏ script/linked ngoài) trước khi lưu.`);
      } else {
        const dataUrl = await fileToDataUrl(f);
        const r = await imageToSvg(dataUrl, { trim: true, maxSide: 1024 });
        setUpSvg(r.svg);
        setUpNote(
          `Đã chuyển ${f.name} (${fmtBytes(f.size)}) → SVG ${fmtBytes(r.bytes)}` +
          (r.width ? ` · ${r.width}×${r.height}` : '') + (r.cropped ? ' · đã cắt viền trong suốt' : '')
        );
      }
    } catch (e) {
      addToast(e?.message || 'Không đọc được ảnh', 'error');
      setUpSvg('');
    }
    setBusy(false);
  };

  const saveLogo = async () => {
    if (!upSvg) return;
    setBusy(true);
    const d = await api(BASE, headers, '/admin/watermark/logo', { method: 'POST', body: JSON.stringify({ svg: upSvg }) });
    setBusy(false);
    if (d.success) {
      addToast(d.message || 'Đã lưu logo', 'success');
      setUpSvg(''); setUpName(''); setUpNote('');
      await load();
      await reloadWatermark();
    } else addToast(`${d.error || 'Lỗi'}${d.code ? ` (${d.code})` : ''}`, 'error');
  };

  const dropLogo = async () => {
    if (!confirm('Xoá logo đã upload và quay về logo đóng gói trong app (/watermark.svg)?')) return;
    await api(BASE, headers, '/admin/watermark/logo', { method: 'DELETE', body: JSON.stringify({}) });
    addToast('Đã xoá logo upload', 'success');
    load(); reloadWatermark();
  };

  const saveLogoUrl = async () => {
    if (!/^https?:\/\//i.test(urlDraft)) return addToast('Nhập URL ảnh bắt đầu bằng http(s)://', 'error');
    const d = await api(BASE, headers, '/admin/watermark', { method: 'POST', body: JSON.stringify({ ...cfg, logo_url: urlDraft.trim(), version: undefined }) });
    if (d.success) { addToast('Đã dùng logo từ URL', 'success'); setCfg({ ...WM_DEFAULTS, ...d.config }); load(); reloadWatermark(); }
    else addToast(d.error || 'Lỗi', 'error');
  };

  // ---------- tuỳ chỉnh theo kênh ----------
  const chList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((c) => !needle || (c.name || '').toLowerCase().includes(needle) || (c.channel_id || '').toLowerCase().includes(needle) || (c.group_title || '').toLowerCase().includes(needle))
      .slice(0, needle ? 60 : 400);
  }, [all, q]);

  const openChannel = (cid) => {
    const ov = ovByChannel.get(cid) || {};
    chKeys.current = new Set(Object.keys(ov));
    setChDraft(ov);
    setSel(cid);
  };
  const patchChannel = (p) => {
    setChDraft((d) => ({ ...d, ...p }));
    p && Object.keys(p).forEach((k) => chKeys.current.add(k));
  };
  const saveChannel = async () => {
    const picked = {};
    for (const k of chKeys.current) if (chDraft[k] !== undefined) picked[k] = chDraft[k];
    setBusy(true);
    const d = await api(BASE, headers, '/admin/watermark/channel', { method: 'POST', body: JSON.stringify({ channel_id: sel, wm: picked }) });
    setBusy(false);
    if (d.success) { addToast(d.cleared ? 'Kênh trở lại dùng cấu hình chung' : `Đã lưu cho ${sel}`, 'success'); load(); reloadWatermark(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  const applyToGroup = async () => {
    const ch = all.find((c) => c.channel_id === sel);
    const group = ch && ch.group_title;
    if (!group) return addToast('Kênh này không có nhóm', 'error');
    const picked = {};
    for (const k of chKeys.current) if (chDraft[k] !== undefined) picked[k] = chDraft[k];
    if (!confirm(`Áp tuỳ chỉnh này cho TẤT CẢ kênh trong nhóm “${group}”?`)) return;
    setBusy(true);
    const d = await api(BASE, headers, '/admin/watermark/group', { method: 'POST', body: JSON.stringify({ group_title: group, wm: picked }) });
    setBusy(false);
    if (d.success) { addToast(`Đã áp cho ${d.affected} kênh`, 'success'); load(); reloadWatermark(); }
    else addToast(d.error || 'Lỗi', 'error');
  };
  const clearChannel = async (cid) => {
    await api(BASE, headers, '/admin/watermark/channel', { method: 'DELETE', body: JSON.stringify({ channel_id: cid }) });
    addToast('Đã bỏ tuỳ chỉnh', 'success');
    if (sel === cid) { setSel(''); setChDraft({}); }
    load(); reloadWatermark();
  };
  const clearAll = async () => {
    if (!confirm('Xoá TOÀN BỘ tuỳ chỉnh theo kênh (mọi kênh quay lại cấu hình chung)?')) return;
    await api(BASE, headers, '/admin/watermark/clear-all', { method: 'POST', body: JSON.stringify({}) });
    addToast('Đã dọn sạch tuỳ chỉnh kênh', 'success');
    load(); reloadWatermark();
  };

  if (!cfg) {
    return (
      <div className="p-6 text-[11px] text-slate-500 flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang tải cấu hình logo… (tab này cần D1 đang bật)
      </div>
    );
  }

  const logoSrc = cfg.logo_url || '/watermark.svg';

  return (
    <div className="p-4 space-y-3">
      {/* ===== header ===== */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[260px] flex-1">
          <h3 className="text-[13px] font-black text-white flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-[#ff9a3d]" /> Logo của web khi đang phát (watermark)
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Logo được đắp lên <b className="text-slate-200">khung hình video</b> ở trang TV, cửa sổ player và lúc xem m3u8 —
            vị trí kéo bằng khung dưới đây. Kênh nào có tuỳ chỉnh riêng thì dùng của nó, còn lại theo cấu hình chung.
            Chi tiết kỹ thuật: <code className="text-slate-300">LOGO_WATERMARK.md</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={cfg.enabled} onChange={(v) => patch({ enabled: v })} label={cfg.enabled ? 'Đang BẬT toàn hệ thống' : 'Đang TẮT toàn hệ thống'} hint="Kênh bật cưỡng bức (mode 'on') vẫn hiện khi tắt chung" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 items-start">
        {/* ===== cấu hình chung + khung kéo ===== */}
        <div className={card}>
          <WatermarkStudio
            defaults={WM_DEFAULTS}
            value={cfg}
            onChange={patch}
            logoUrl={logoSrc}
            title="Cấu hình chung (mọi kênh)"
          />
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
            <button onClick={saveGlobal} disabled={!dirty || busy} className={btnP}><Save className="w-3.5 h-3.5" /> {dirty ? 'Lưu cấu hình chung' : 'Đã lưu'}</button>
            <button onClick={() => { load(); reloadWatermark(); }} className={btnG}><RefreshCw className="w-3.5 h-3.5" /> Nạp lại</button>
            <span className="text-[10px] text-slate-500 ml-auto">
              Phiên bản cấu hình: <b className="text-slate-300 font-mono">#{cfg.version || 0}</b> · người xem thấy sau ≤ 4 phút (cache) hoặc tải lại trang
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {/* ===== logo ===== */}
          <div className={card}>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#ff9a3d]" /> File logo
            </p>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                <img src={logoSrc} alt="logo" className="max-w-[85%] max-h-[85%] object-contain" onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed min-w-0">
                <p className="font-bold text-slate-200 text-[11px] break-all">{logoSrc}</p>
                <p className="mt-0.5">{logo.has_custom ? `Logo upload · ${fmtBytes(logo.bytes)}` : 'Logo mặc định đóng gói trong app'}</p>
                <p className="text-slate-500">Nên dùng SVG 512×512 nền trong suốt để nhỏ gọn và không vỡ hạt.</p>
              </div>
            </div>

            <div className="mt-2.5 space-y-2">
              <label className={`${btnG} justify-center cursor-pointer`}>
                <Upload className="w-3.5 h-3.5" /> Chọn PNG / JPG / WEBP / SVG
                <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                  onChange={(e) => { pickFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
              </label>
              {upSvg && (
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-2.5">
                  <p className="text-[10px] text-emerald-200 leading-snug">{upNote}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-14 h-14 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(upSvg)}`} alt="preview" className="max-w-[85%] max-h-[85%] object-contain" />
                    </div>
                    <p className="text-[10px] text-slate-400 flex-1">Xem trước file SVG sẽ lưu (nền đen chỉ để thấy phần trong suốt).</p>
                    <button onClick={saveLogo} disabled={busy} className={btnP}><Check className="w-3.5 h-3.5" /> Lưu SVG</button>
                    <button onClick={() => { setUpSvg(''); setUpNote(''); }} className="px-2 py-1 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )}
              {logo.has_custom && (
                <button onClick={dropLogo} className="text-[10px] text-slate-500 hover:text-red-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Xoá logo upload, dùng lại /watermark.svg</button>
              )}
              <div className="flex items-center gap-2">
                <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="…hoặc dán URL ảnh: https://cdn.example.com/logo.svg" className={inp + ' font-mono'} />
                <button onClick={saveLogoUrl} className={btnG + ' shrink-0'}>Dùng URL</button>
              </div>
            </div>
          </div>

          {/* ===== phạm vi hiện ===== */}
          <div className={card}>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-[#ff9a3d]" /> Hiện ở đâu
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.keys(WM_PAGE_LABEL).map((k) => (
                <Switch key={k} checked={cfg.pages?.[k] ? 1 : 0} onChange={(v) => patch({ pages: { ...cfg.pages, [k]: v } })} label={WM_PAGE_LABEL[k]} />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pt-2 border-t border-white/[0.06]">
              <Switch checked={cfg.only_live} onChange={(v) => patch({ only_live: v })} label="Chỉ khi phát live" hint="Tắt trên phim / catch-up (timeshift)" />
              <Switch checked={cfg.hide_buffering} onChange={(v) => patch({ hide_buffering: v })} label="Ẩn lúc đang tải" hint="Mượt hơn khi đứng hình chờ" />
              <Switch checked={cfg.fit === 'video' ? 1 : 0} onChange={(v) => patch({ fit: v ? 'video' : 'container' })} label="Bám khung hình thật" hint="Bỏ: logo theo cả khung, kể cả dải đen letterbox" />
            </div>
            <p className="text-[10px] text-slate-500 mt-2.5 leading-relaxed">
              Cửa sổ Picture-in-Picture và Chromecast/AirPlay chỉ nhân bản thẻ <code>&lt;video&gt;</code> nên logo KHÔNG hiện ở đó —
              muốn đóng dấu cứng vào mọi đường ra thì phải burn-in ở nguồn phát.
            </p>
          </div>
        </div>
      </div>

      {/* ===== theo kênh ===== */}
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            {ovByChannel.size > 0 ? <Eye className="w-3.5 h-3.5 text-[#ff9a3d]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />} Tuỳ chỉnh theo từng kênh
          </p>
          <span className="text-[10px] text-slate-500">
            {ovByChannel.size}/{total || all.length} kênh có cấu hình riêng
          </span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kênh / nhóm…" className={inp + ' max-w-[220px] ml-auto'} />
          {ovByChannel.size > 0 && <button onClick={clearAll} className="text-[10px] font-bold text-slate-500 hover:text-red-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Xoá hết</button>}
        </div>

        {groups.length > 1 && !sel && (
          <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
            Mẹo: mở một kênh rồi bấm <b className="text-slate-300">“Áp cho cả nhóm”</b> để đặt vị trí cho cả loạt
            ({groups.slice(0, 6).join(' · ')}{groups.length > 6 ? ' …' : ''}).
          </p>
        )}

        {sel && (
          <div className="rounded-xl border border-[#f36f21]/30 bg-[#f36f21]/[0.05] p-3 mb-2.5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="text-[12px] font-black text-white">{all.find((c) => c.channel_id === sel)?.name || sel}</p>
              <span className="text-[10px] text-slate-400">{all.find((c) => c.channel_id === sel)?.group_title}</span>
              <button onClick={() => { setSel(''); setChDraft({}); }} className="ml-auto px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white">Đóng</button>
            </div>
            <WatermarkStudio
              defaults={cfg}
              value={chDraft}
              onChange={patchChannel}
              logoUrl={logoSrc}
              showModeSwitch
              mode={chDraft.mode || ''}
              onModeChange={(v) => (v ? patchChannel({ mode: v }) : (ovByChannel.has(sel) ? clearChannel(sel) : setSel('')))}
              hint="Kéo khung logo để đặt riêng cho kênh này. Các giá trị không đụng tới sẽ theo cấu hình chung."
            />
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={saveChannel} disabled={busy} className={btnP}><Save className="w-3.5 h-3.5" /> Lưu cho kênh này</button>
              <button onClick={applyToGroup} disabled={busy} className={btnG}><Layers className="w-3.5 h-3.5" /> Áp cho cả nhóm</button>
              {ovByChannel.has(sel) && <button onClick={() => clearChannel(sel)} className="text-[10px] font-bold text-slate-500 hover:text-red-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Bỏ tuỳ chỉnh</button>}
              <span className="text-[10px] text-slate-500 ml-auto">Đè lên cấu hình chung: {chKeys.current.size ? [...chKeys.current].join(', ') : '—'}</span>
            </div>
          </div>
        )}

        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
          {chList.map((c) => {
            const ov = ovByChannel.get(c.channel_id);
            const badge = !ov ? null : ov.mode === 'off' ? { t: 'Tắt riêng', c: 'text-red-300 bg-red-500/10 border-red-500/25' } : { t: 'Tuỳ chỉnh', c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' };
            return (
              <div key={c.channel_id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${sel === c.channel_id ? 'border-[#f36f21]/50 bg-[#f36f21]/[0.07]' : 'border-white/[0.06] bg-black/25 hover:border-white/15'}`}>
                {c.logo ? <img src={c.logo} alt="" className="w-5 h-5 rounded object-contain bg-black/40 shrink-0" onError={(e) => (e.currentTarget.style.opacity = 0.15)} /> : <span className="w-5 h-5 rounded bg-white/[0.06] shrink-0" />}
                <span className="text-[11px] text-slate-200 truncate flex-1 min-w-0">{c.name}</span>
                <span className="text-[9px] text-slate-600 truncate max-w-[90px] hidden sm:block">{c.group_title}</span>
                {badge && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge.c}`}>{badge.t}</span>}
                {ov && ov.size !== undefined && <span className="text-[9px] font-mono text-slate-500 hidden md:block">{ov.pos || 'theo chung'} · {ov.size}%</span>}
                <button onClick={() => (sel === c.channel_id ? setSel('') : openChannel(c.channel_id))} className="text-[10px] font-bold text-slate-400 hover:text-white px-1.5 shrink-0">
                  {sel === c.channel_id ? 'Đóng' : 'Sửa'}
                </button>
              </div>
            );
          })}
          {chList.length === 0 && <p className="text-[11px] text-slate-600 italic">Không tìm thấy kênh nào (danh sách kênh lấy từ /api/channels).</p>}
        </div>
      </div>

      <p className="text-[10px] text-slate-600 leading-relaxed">
        Thứ tự ưu tiên: <b className="text-slate-500">tuỳ chỉnh của kênh</b> → <b className="text-slate-500">cấu hình chung</b> → mặc định của app (bật, góc trên phải, 9% chiều cao).
        Ảnh chỉ được vẽ bằng <code>&lt;img&gt;</code> nên SVG upload sẽ được gỡ script/tham chiếu ngoài trước khi lưu.
      </p>
    </div>
  );
}
