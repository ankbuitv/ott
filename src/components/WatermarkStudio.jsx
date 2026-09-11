import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WM_DEFAULTS, wmBoxStyle, wmFilterFor, wmPlateStyle, wmSnapFromCenter, WM_POS_LABEL } from '../services/watermark';

/**
 * Khung kéo đặt logo watermark (16:9) + các slider.
 * Dùng chung cho 2 chỗ trong Admin → “Logo khi phát”:
 *   • cấu hình chung của toàn hệ thống
 *   • tuỳ chỉnh RIÊNG theo 1 kênh
 * Vị trí/kích thước tính đúng bằng công thức mà <StreamWatermark/> dùng khi phát,
 * nên "thấy trong admin thế nào thì người xem thấy thế ấy".
 */

const POS_GRID = [['tl', 'tc', 'tr'], ['ml', 'custom', 'mr'], ['bl', 'bc', 'br']];
const POS_GLYPH = { tl: '↖', tc: '↑', tr: '↗', ml: '←', mr: '→', bl: '↙', bc: '↓', br: '↘' };
const STYLE_OPTS = [['plain', 'Không nền'], ['shadow', 'Viền mềm'], ['plate', 'Nền đen'], ['glass', 'Kính mờ']];
const TINT_OPTS = [['none', 'Giữ màu'], ['white', 'Hoà trắng'], ['black', 'Đen']];
const TEXT_OPTS = [['none', 'Không hiện'], ['right', 'Bên phải'], ['bottom', 'Dưới logo'], ['top', 'Trên logo']];

const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v * 10) / 10;

const inp = 'w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#f36f21]/50';

function Slider({ label, value, min, max, step = 1, unit = '', onChange, hint }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        <b className="text-slate-200 normal-case font-mono">{r1(value)}{unit}</b>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#f36f21] mt-1"
      />
      {hint && <span className="block text-[10px] text-slate-600 -mt-0.5">{hint}</span>}
    </label>
  );
}

function Seg({ label, opts, value, onChange }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {opts.map(([v, l]) => (
          <button
            key={v} type="button" onClick={() => onChange(v)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${value === v ? 'grad-brand text-white' : 'bg-white/[0.05] text-slate-400 hover:text-white hover:bg-white/[0.09]'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WatermarkStudio({
  defaults = WM_DEFAULTS,
  value = {},
  onChange,
  logoUrl = '',
  mode,
  onModeChange,
  showModeSwitch = false,
  readOnly = false,
  showSliders = true,
  title,
  hint,
}) {
  const merged = useMemo(() => ({ ...WM_DEFAULTS, ...defaults, ...(value || {}) }), [defaults, value]);
  const stageRef = useRef(null);
  const boxRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [boxH, setBoxH] = useState(0);

  // Đo chiều cao khung để cỡ chữ dòng mô tả to/nhỏ theo đúng tỉ lệ logo
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || 0));
    try { ro.observe(el); } catch {}
    return () => { try { ro.disconnect(); } catch {} };
  }, []);

  const pctFromEvent = (e) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return { cx: clamp(((e.clientX - r.left) / r.width) * 100), cy: clamp(((e.clientY - r.top) / r.height) * 100) };
  };
  const centerNow = () => {
    const s = stageRef.current?.getBoundingClientRect();
    const b = boxRef.current?.getBoundingClientRect();
    if (!s || !b || !s.width || !s.height) return { cx: merged.x, cy: merged.y };
    return { cx: ((b.left + b.width / 2 - s.left) / s.width) * 100, cy: ((b.top + b.height / 2 - s.top) / s.height) * 100 };
  };

  const onDown = (e) => {
    if (readOnly) return;
    const p = pctFromEvent(e);
    if (!p) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDragging(true);
    onChange({ pos: 'custom', x: r1(p.cx), y: r1(p.cy) });
  };
  const onMove = (e) => {
    if (!dragging || readOnly) return;
    const p = pctFromEvent(e);
    if (!p) return;
    onChange({ pos: 'custom', x: r1(p.cx), y: r1(p.cy) });
  };
  const onUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    const p = pctFromEvent(e) || centerNow();
    const cx = 'cx' in p ? p.cx : merged.x;
    const cy = 'cy' in p ? p.cy : merged.y;
    const sn = wmSnapFromCenter(cx, cy, merged.margin);
    onChange({ pos: sn.pos, x: r1(sn.x), y: r1(sn.y) });
  };
  const onKey = (e) => {
    if (readOnly) return;
    const step = e.shiftKey ? 5 : 1;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    const c = centerNow();
    onChange({ pos: 'custom', x: r1(clamp(c.cx + d[0])), y: r1(clamp(c.cy + d[1])) });
  };

  const boxStyle = { ...wmBoxStyle(merged), ...(boxH ? { fontSize: `${Math.max(7, Math.min(30, boxH * (merged.size / 100) * 0.34))}px` } : {}) };
  const dir = merged.text_pos === 'bottom' ? 'column' : merged.text_pos === 'top' ? 'column-reverse' : 'row';
  const posName = WM_POS_LABEL[merged.pos] || merged.pos;

  return (
    <div className="space-y-2.5">
      {title && (
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          {title}
          <span className="ml-auto normal-case tracking-normal font-bold text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-400">{posName}</span>
        </p>
      )}

      {showModeSwitch && (
        <div className="flex flex-wrap gap-1">
          {[['', 'Theo cấu hình chung'], ['on', 'Luôn bật kênh này'], ['off', 'Tắt kênh này']].map(([v, l]) => (
            <button
              key={v || 'auto'} type="button" onClick={() => onModeChange && onModeChange(v)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${mode === v ? 'grad-brand text-white' : 'bg-white/[0.05] text-slate-400 hover:text-white'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ==== KHUNG KÉO ==== */}
      <div
        ref={stageRef}
        tabIndex={readOnly ? -1 : 0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        role="group"
        aria-label="Khung kéo đặt vị trí logo"
        className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 focus:outline-none focus:border-[#f36f21]/60"
        style={{
          cursor: readOnly ? 'default' : dragging ? 'grabbing' : 'crosshair',
          background: 'linear-gradient(115deg, #101319 0%, #1c2430 38%, #0d1015 62%, #191014 100%)',
          touchAction: 'none',
        }}
      >
        {/* giả lập dải letterbox để thấy logo bám khung hình thật */}
        <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: '7%' }} />
        <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ height: '7%' }} />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black tracking-[.35em] text-white/15 select-none">
          KHUNG HÌNH 16:9
        </span>
        {/* vùng an toàn */}
        <div className="absolute border border-dashed border-white/12 rounded-md pointer-events-none" style={{ inset: `${merged.margin}%` }} />

        {/* hộp logo kéo được */}
        <div
          ref={boxRef}
          className="absolute"
          style={{
            ...boxStyle,
            ...wmPlateStyle(merged),
            display: 'flex', flexDirection: dir, alignItems: 'center', gap: merged.text ? '0.45em' : 0,
            pointerEvents: readOnly ? 'none' : 'auto', cursor: 'grab',
            outline: dragging ? '1.5px dashed rgba(243,111,33,.95)' : '1px dashed rgba(255,255,255,.35)',
            outlineOffset: '3px',
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" draggable="false" style={{ display: 'block', height: dir === 'row' ? '100%' : '58%', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: wmFilterFor(merged), pointerEvents: 'none' }} />
          ) : (
            <div className="rounded-md bg-white/15 border border-white/25" style={{ height: dir === 'row' ? '100%' : '58%', width: 'min(2.6em, 18vw)' }} />
          )}
          {merged.text && merged.text_pos !== 'none' && (
            <span style={{ color: '#fff', fontWeight: 800, letterSpacing: '.06em', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,.8)' }}>{merged.text}</span>
          )}
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-slate-500">
        {hint || 'Kéo khung logo (hoặc bấm vào bất kỳ đâu trong khung) để đổi vị trí — thả ra gần góc sẽ tự hít vào góc đó. Có thể bấm vào khung rồi dùng phím mũi tên (giữ Shift = nhảy 5%).'}
      </p>
      <p className="text-[10px] font-mono text-slate-400">
        tâm: x {r1(merged.x)}% · y {r1(merged.y)}% · cách mép {r1(merged.margin)}%
      </p>

      {/* ==== BÀN PHÍM VỊ TRÍ 3×3 ==== */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="grid grid-cols-3 gap-1 p-1.5 rounded-xl bg-black/30 border border-white/[0.06]">
          {POS_GRID.flat().map((p) => (
            <button
              key={p} type="button" disabled={readOnly}
              onClick={() => onChange({ pos: p })}
              title={WM_POS_LABEL[p]}
              className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${merged.pos === p ? 'bg-[#f36f21] text-white shadow-[0_0_0_1px_rgba(255,154,61,.6)]' : 'bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/[0.12]'}`}
            >
              {p === 'custom' ? '✦' : POS_GLYPH[p]}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-slate-500 leading-relaxed max-w-[16rem]">
          <b className="text-slate-300">9 điểm bám</b> — góc/cạnh. Chọn <b className="text-slate-300">✦</b> để giữ đúng chỗ vừa kéo (không hít vào góc).
        </div>
      </div>

      {showSliders && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <Slider label="Cỡ logo" unit="% cao" min={2} max={40} step={0.5} value={merged.size} onChange={(v) => onChange({ size: v })} hint="tính theo chiều cao khung hình" />
          <Slider label="Độ mờ" unit="%" min={5} max={100} value={merged.opacity} onChange={(v) => onChange({ opacity: v })} />
          <Slider label="Cách mép" unit="%" min={0} max={20} step={0.5} value={merged.margin} onChange={(v) => onChange({ margin: v })} hint="chỉ ảnh hưởng khi bám góc/cạnh" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-0.5">
        <Seg label="Kiểu" opts={STYLE_OPTS} value={merged.style} onChange={(v) => onChange({ style: v })} />
        <Seg label="Màu" opts={TINT_OPTS} value={merged.tint} onChange={(v) => onChange({ tint: v })} />
        <Seg label="Chỗ đặt mô tả" opts={TEXT_OPTS} value={merged.text_pos} onChange={(v) => onChange({ text_pos: v })} />
      </div>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dòng mô tả kèm logo (tuỳ chọn)</span>
        <input
          className={inp + ' mt-1'} maxLength={48} value={merged.text} disabled={readOnly}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="VD: CHRTV PLAY · exclusive"
        />
        <span className="block text-[10px] text-slate-600 mt-0.5">Để trống = chỉ hiện logo. Tối đa 48 ký tự.</span>
      </label>
    </div>
  );
}
