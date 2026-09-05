import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useDevice } from '../contexts/DeviceContext';
import { Calendar, Clock, Play, Search, Filter, Tv, Radio } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { formatTimeHHMM, formatDateVN, parseEpgDate } from '../utils/dateUtils';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * EpgGridTimeline — Lịch phát sóng.
 *
 * ⚡ HIỆU NĂNG (fix lag kéo đi kéo lại):
 *  - Bản cũ: mỗi kênh render lại là filter TOÀN BỘ programmes (hàng chục nghìn) 3 lượt
 *    => O(số kênh × programmes) mỗi lần gõ tìm kiếm/chuyển tab => lag khủng.
 *  - Bản mới: đánh index programmes 1 LẦN duy nhất theo epgData (Map: id chính xác /
 *    id chuẩn hoá / tên kênh, precompute timestamp + sort sẵn). Lấy chương trình của
 *    1 kênh = tra O(1) + filter mảng nhỏ của đúng kênh đó.
 *  - Lazy render từng hàng: IntersectionObserver chỉ render chips khi hàng sắp lọt
 *    viewport (rootMargin 400px) — 200 kênh vẫn cuộn mượt.
 *  - Spatial navigation (FocusableWrapper) chỉ bật trên TV thật; mobile/desktop dùng
 *    <button> thường — đỡ đăng ký hàng nghìn node vào spatial-nav store vô ích.
 */
export default function EpgGridTimeline({
  channels = [],
  epgData = null,
  onPlayCatchup,
  onSelectChannel,
}) {
  const { t } = useI18n();
  const device = useDevice();
  const useSpatial = !!device.isTV; // chỉ TV mới cần D-pad focus

  const [selectedCategory, setSelectedCategory] = useState(t('movies.genre.all'));
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const dateTabs = useMemo(() => {
    const tabs = [];
    const now = new Date();
    // 7 ngày qua (xem lại/catchup) + hôm nay + 6 ngày tới (lịch phát sóng)
    for (let offset = -6; offset <= 6; offset++) {
      const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      tabs.push({
        offset,
        date: d,
        future: offset > 0,
        label: offset === 0 ? t('epg.today') : (offset === -1 ? t('epg.yesterday') : (offset === 1 ? t('epg.tomorrow') : formatDateVN(d)))
      });
    }
    return tabs;
  }, [t]);

  const categories = useMemo(() => {
    const groups = new Set([t('movies.genre.all')]);
    channels.forEach(ch => { if (ch.group_title) groups.add(ch.group_title); });
    return Array.from(groups);
  }, [channels]);

  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchCat = selectedCategory === t('movies.genre.all') || ch.group_title === selectedCategory;
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, selectedCategory, searchQuery]);

  // ===== ⚡ INDEX: build đúng 1 lần mỗi khi epgData đổi =====
  const programmeIndex = useMemo(() => {
    const exact = new Map();    // channel_id gốc -> mảng programmes (sort theo start)
    const byNormId = new Map(); // norm(channel_id) -> mảng programmes
    const byName = new Map();   // norm(tên hiển thị) -> mảng programmes
    const programmes = epgData?.programmes || [];

    for (let i = 0; i < programmes.length; i++) {
      const p = programmes[i];
      // Precompute timestamp — khỏi parse lại mỗi chip mỗi render
      p._startTs = parseEpgDate(p.start).getTime();
      p._stopTs = parseEpgDate(p.stop).getTime();
      const arr = exact.get(p.channel);
      if (arr) arr.push(p);
      else exact.set(p.channel, [p]);
    }
    for (const [id, arr] of exact.entries()) {
      arr.sort((a, b) => a._startTs - b._startTs);
      const n = norm(id);
      if (!n) continue;
      const cur = byNormId.get(n);
      if (cur) cur.push(...arr);
      else byNormId.set(n, arr);
    }
    // Map tên kênh -> channel_id (từ meta channels của EPG và display_name trên programme)
    const nameToId = new Map();
    if (epgData?.channels && typeof epgData.channels === 'object') {
      for (const c of Object.values(epgData.channels)) {
        if (c?.name) nameToId.set(norm(c.name), c.id);
      }
    }
    for (const p of programmes) {
      if (p.display_name) nameToId.set(norm(p.display_name), p.channel);
    }
    for (const [n, chId] of nameToId.entries()) {
      const arr = exact.get(chId);
      if (arr && !byName.has(n)) byName.set(n, arr);
    }
    return { exact, byNormId, byName };
  }, [epgData]);

  // Tra programmes của 1 kênh: exact -> norm id -> tên (fallback như bản cũ nhưng tra Map)
  const getProgramsFor = useCallback((channel) => {
    const chId = String(channel.channel_id || '');
    let pool = programmeIndex.exact.get(chId);
    if (!pool) pool = programmeIndex.byNormId.get(norm(chId));
    if (!pool) {
      const n = norm(channel.name);
      if (n) {
        pool = programmeIndex.byName.get(n);
        if (!pool) {
          // Fallback tên gần đúng — chỉ chạy với kênh khớp hết 2 bước trên (hiếm)
          for (const [key, arr] of programmeIndex.byName.entries()) {
            if (key.includes(n) || n.includes(key)) { pool = arr; break; }
          }
        }
      }
    }
    return pool || [];
  }, [programmeIndex]);

  // Đ_range thời gian của tab ngày đang chọn
  const dayRange = useMemo(() => {
    const targetDate = dateTabs.find(tab => tab.offset === selectedDayOffset)?.date || new Date();
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);
    return { startTs: startOfDay.getTime(), endTs: endOfDay.getTime() };
  }, [selectedDayOffset, dateTabs]);

  // ===== ⚡ Rows: chỉ tính lại khi đổi filter/ngày — KHÔNG tính inline trong render =====
  const rows = useMemo(() => {
    const capped = filteredChannels.slice(0, 300); // an toàn tuyệt đối, vẫn quá đủ
    return capped.map(channel => ({
      channel,
      programs: getProgramsFor(channel).filter(p => p._startTs >= dayRange.startTs && p._startTs <= dayRange.endTs),
    }));
  }, [filteredChannels, dayRange, getProgramsFor]);

  return (
    <div className="flex flex-col h-full bg-[#0d0e12] text-slate-100 p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[#f36f21] font-bold uppercase tracking-wider text-[10px] mb-0.5">
            <Calendar className="w-3.5 h-3.5" /> LỊCH PHÁT SÓNG
          </div>
          <h1 className="text-xl font-extrabold text-white">EPG & Xem Lại</h1>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm kênh..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-[#f36f21]/60 transition-colors"
          />
        </div>
      </div>

      {/* Day Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
        {dateTabs.map((tab) => (
          <FocusableWrapper
            key={tab.offset}
            onClick={() => setSelectedDayOffset(tab.offset)}
            className={`px-3 py-2 rounded-lg font-medium text-xs whitespace-nowrap flex items-center gap-1.5 transition-all ${
              selectedDayOffset === tab.offset
                ? (tab.future ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30 font-bold' : 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/30 font-bold')
                : tab.future
                ? 'bg-slate-900/60 border border-sky-800/40 text-sky-300/80 hover:bg-slate-800 hover:text-sky-200'
                : 'bg-slate-900/60 border border-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </FocusableWrapper>
        ))}
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 border-b border-slate-800/50">
        <span className="text-[10px] text-slate-500 font-semibold uppercase mr-1.5 flex items-center gap-1">
          <Filter className="w-3 h-3" /> Loại:
        </span>
        {categories.map((cat) => (
          <FocusableWrapper
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-[#f36f21]/15 text-[#ff9a3d] border border-[#f36f21]/40'
                : 'bg-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            {cat}
          </FocusableWrapper>
        ))}
      </div>

      {/* EPG Grid — từng hàng tự lazy-render khi lọt viewport */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {rows.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/20 rounded-xl border border-slate-800/30">
            <Tv className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-medium">Không tìm thấy kênh.</p>
          </div>
        ) : (
          rows.map(({ channel, programs }) => (
            <EpgRow
              key={channel.channel_id}
              channel={channel}
              programs={programs}
              useSpatial={useSpatial}
              onSelectChannel={onSelectChannel}
              onPlayCatchup={onPlayCatchup}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Một hàng EPG = header kênh (luôn render, nhẹ) + dải chương trình (CHỈ render khi
 * hàng sắp lọt viewport — IntersectionObserver rootMargin 400px). Memo hoá để đổi
 * tab ngày/category không re-render lại các hàng chưa đổi dữ liệu.
 */
const EpgRow = React.memo(function EpgRow({ channel, programs, useSpatial, onSelectChannel, onPlayCatchup }) {
  const rowRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    // Không có IO (TV box cũ) -> render luôn, vẫn nhanh nhờ index
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // nowTs tính 1 lần mỗi lần programs đổi — khỏi new Date() từng chip
  const nowTs = useMemo(() => Date.now(), [programs]);

  return (
    <div
      ref={rowRef}
      className="bg-[#13151c] border border-slate-800/40 rounded-xl p-3 flex flex-col md:flex-row gap-3 items-stretch shadow-sm"
      style={{ minHeight: 86 }}
    >
      {/* Header kênh */}
      <ChannelTag useSpatial={useSpatial} channel={channel} onSelectChannel={onSelectChannel} />

      {/* Dải chương trình */}
      <div className="flex-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {programs.length === 0 ? (
          <div className="flex items-center justify-center p-3 text-[11px] text-slate-600 italic bg-[#0d0e12]/40 rounded-lg w-full">
            Chưa có dữ liệu EPG
          </div>
        ) : !inView ? (
          // Placeholder nhẹ khi chưa tới viewport — giữ layout, không render chips
          <div className="flex items-center p-3 text-[11px] text-slate-700 bg-[#0d0e12]/20 rounded-lg w-full">
            <Clock className="w-3 h-3 mr-1.5 animate-pulse" /> {programs.length} chương trình…
          </div>
        ) : (
          programs.slice(0, 60).map((prog, idx) => (
            <ProgrammeChip
              key={`${prog.start}-${idx}`}
              prog={prog}
              channel={channel}
              nowTs={nowTs}
              useSpatial={useSpatial}
              onSelectChannel={onSelectChannel}
              onPlayCatchup={onPlayCatchup}
            />
          ))
        )}
      </div>
    </div>
  );
});

/** Nút kênh — TV dùng FocusableWrapper (D-pad), còn lại dùng button thường */
function ChannelTag({ useSpatial, channel, onSelectChannel }) {
  const content = (
    <>
      <img
        src={channel.logo || 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'}
        alt={channel.name}
        className="w-10 h-10 object-contain rounded bg-[#13151c] p-0.5"
        onError={(e) => { e.target.src = 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'; }}
      />
      <div className="min-w-0">
        <h3 className="font-bold text-slate-100 truncate text-xs">{channel.name}</h3>
        <span className="text-[10px] text-slate-500 font-medium">{channel.group_title}</span>
      </div>
    </>
  );
  const cls = "md:w-56 flex items-center gap-2.5 bg-[#0d0e12]/60 p-2.5 rounded-lg border border-slate-800/30 shrink-0 hover:border-[#f36f21]/40 transition-all";
  if (useSpatial) {
    return <FocusableWrapper onClick={() => onSelectChannel && onSelectChannel(channel)} className={cls}>{content}</FocusableWrapper>;
  }
  return <button type="button" onClick={() => onSelectChannel && onSelectChannel(channel)} className={cls}>{content}</button>;
}

/**
 * Chip chương trình — memo hoá: chỉ re-render khi đổi prog/state.
 * Trạng thái: past (xem lại) / live / soon (≤5p vào sống) / future.
 */
const ProgrammeChip = React.memo(function ProgrammeChip({ prog, channel, nowTs, useSpatial, onSelectChannel, onPlayCatchup }) {
  const isPast = prog._stopTs < nowTs;
  const isLiveNow = prog._startTs <= nowTs && prog._stopTs >= nowTs;
  const isSoon = !isPast && !isLiveNow && prog._startTs <= nowTs + 5 * 60 * 1000;

  const handleClick = useCallback(() => {
    if (isPast) {
      // Server xin token catchup (kèm thời điểm program) — client không build URL
      if (onPlayCatchup) onPlayCatchup(channel, prog);
    } else if (isLiveNow || isSoon) {
      // Đang phát / sắp phát trong 5 phút -> vào sống
      if (onSelectChannel) onSelectChannel(channel);
    }
  }, [isPast, isLiveNow, isSoon, channel, prog, onPlayCatchup, onSelectChannel]);

  const content = (
    <>
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5 text-[#f36f21]/70" />
            {formatTimeHHMM(prog.start)} - {formatTimeHHMM(prog.stop)}
          </span>
          {isLiveNow && (
            <span className="px-1.5 py-px text-[9px] font-bold rounded bg-[#f36f21] text-white flex items-center gap-0.5">
              <Radio className="w-2 h-2 animate-pulse" /> LIVE
            </span>
          )}
          {isPast && (
            <span className="px-1 py-px text-[9px] font-medium rounded bg-purple-900/60 text-purple-300 flex items-center gap-0.5">
              <Play className="w-2 h-2 fill-current" /> Xem lại
            </span>
          )}
          {isSoon && (
            <span className="px-1 py-px text-[9px] font-medium rounded bg-sky-900/50 text-sky-300 flex items-center gap-0.5">
              <Clock className="w-2 h-2" /> Sắp phát
            </span>
          )}
        </div>
        <h4 className="font-semibold text-[11px] text-slate-200 line-clamp-2 leading-snug">{prog.title}</h4>
      </div>
      <p className="text-[10px] text-slate-500 line-clamp-1 mt-1.5">{prog.desc}</p>
    </>
  );

  const cls = `w-56 p-2.5 rounded-lg border shrink-0 flex flex-col justify-between transition-colors ${
    isLiveNow
      ? 'bg-[#7a2f0e]/30 border-[#f36f21]/60'
      : isPast
      ? 'bg-[#0d0e12]/40 border-slate-800/40 hover:border-slate-600/60'
      : 'bg-[#0d0e12]/20 border-slate-800/20 text-slate-600'
  }`;

  if (useSpatial) {
    return <FocusableWrapper onClick={handleClick} className={cls}>{content}</FocusableWrapper>;
  }
  return <button type="button" onClick={handleClick} className={cls}>{content}</button>;
});
