import React, { useState, useMemo } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { Calendar, Clock, Play, Search, Filter, Tv, Radio } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { formatTimeHHMM, formatDateVN, parseEpgDate } from '../utils/dateUtils';
import { generateCatchupUrl } from './VideoPlayer';

export default function EpgGridTimeline({
  channels = [],
  epgData = null,
  onPlayCatchup,
  onSelectChannel,
}) {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState(t('movies.genre.all'));
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const dateTabs = useMemo(() => {
    const tabs = [];
    const now = new Date();
    for (let offset = 0; offset >= -6; offset--) {
      const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      tabs.push({
        offset,
        date: d,
        label: offset === 0 ? t('epg.today') : (offset === -1 ? t('epg.yesterday') : formatDateVN(d))
      });
    }
    return tabs;
  }, []);

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

  const getProgramsForChannelAndDay = (channel) => {
    if (!epgData || !epgData.programmes || !channel) return [];
    const targetDate = dateTabs.find(t => t.offset === selectedDayOffset)?.date || new Date();
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

    // Resolve the EPG channel id(s) for this channel: exact, then normalized, then by name
    const chId = String(channel.channel_id || '');
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const chNorm = norm(chId);
    const chName = norm(channel.name);

    let pool = epgData.programmes.filter(p => p.channel === chId);
    if (pool.length === 0) pool = epgData.programmes.filter(p => norm(p.channel) === chNorm);
    if (pool.length === 0 && chName) {
      pool = epgData.programmes.filter(p => {
        const pn = norm(p.display_name || p.channel);
        return pn && (pn === chName || pn.includes(chName) || chName.includes(pn));
      });
    }

    return pool
      .filter(p => {
        const pStart = parseEpgDate(p.start);
        return pStart >= startOfDay && pStart <= endOfDay;
      })
      .sort((a, b) => parseEpgDate(a.start) - parseEpgDate(b.start));
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0e12] text-slate-100 p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-red-500 font-bold uppercase tracking-wider text-[10px] mb-0.5">
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
            className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-red-600/60 transition-colors"
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
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-bold'
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
                ? 'bg-red-600/15 text-red-400 border border-red-600/40'
                : 'bg-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            {cat}
          </FocusableWrapper>
        ))}
      </div>

      {/* EPG Grid */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/20 rounded-xl border border-slate-800/30">
            <Tv className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-medium">Không tìm thấy kênh.</p>
          </div>
        ) : (
          filteredChannels.map((channel) => {
            const programs = getProgramsForChannelAndDay(channel);
            return (
              <div
                key={channel.channel_id}
                className="bg-[#13151c] border border-slate-800/40 rounded-xl p-3 flex flex-col md:flex-row gap-3 items-stretch shadow-sm"
              >
                <FocusableWrapper
                  onClick={() => onSelectChannel && onSelectChannel(channel)}
                  className="md:w-56 flex items-center gap-2.5 bg-[#0d0e12]/60 p-2.5 rounded-lg border border-slate-800/30 shrink-0 hover:border-red-600/40 transition-all"
                >
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
                </FocusableWrapper>

                <div className="flex-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {programs.length === 0 ? (
                    <div className="flex items-center justify-center p-3 text-[11px] text-slate-600 italic bg-[#0d0e12]/40 rounded-lg w-full">
                      Chưa có dữ liệu EPG
                    </div>
                  ) : programs.map((prog, idx) => {
                    const pStart = parseEpgDate(prog.start);
                    const pStop = parseEpgDate(prog.stop);
                    const now = new Date();
                    const isPast = pStop < now;
                    const isLiveNow = pStart <= now && pStop >= now;

                    return (
                      <FocusableWrapper
                        key={idx}
                        onClick={() => {
                          if (isPast || isLiveNow) {
                            const catchupUrl = generateCatchupUrl(channel.stream_url, prog.start, channel.catchup_type);
                            if (onPlayCatchup) onPlayCatchup(channel, prog, catchupUrl);
                          }
                        }}
                        className={`w-56 p-2.5 rounded-lg border shrink-0 flex flex-col justify-between transition-all ${
                          isLiveNow
                            ? 'bg-red-950/30 border-red-600/60'
                            : isPast
                            ? 'bg-[#0d0e12]/40 border-slate-800/40 hover:border-slate-700/60'
                            : 'bg-[#0d0e12]/20 border-slate-800/20 text-slate-600'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5 text-red-500/70" />
                              {formatTimeHHMM(prog.start)} - {formatTimeHHMM(prog.stop)}
                            </span>
                            {isLiveNow && (
                              <span className="px-1.5 py-px text-[9px] font-bold rounded bg-red-600 text-white flex items-center gap-0.5">
                                <Radio className="w-2 h-2 animate-pulse" /> LIVE
                              </span>
                            )}
                            {isPast && (
                              <span className="px-1 py-px text-[9px] font-medium rounded bg-purple-900/60 text-purple-300 flex items-center gap-0.5">
                                <Play className="w-2 h-2 fill-current" /> Xem lại
                              </span>
                            )}
                          </div>
                          <h4 className="font-semibold text-[11px] text-slate-200 line-clamp-2 leading-snug">{prog.title}</h4>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-1 mt-1.5">{prog.desc}</p>
                      </FocusableWrapper>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
