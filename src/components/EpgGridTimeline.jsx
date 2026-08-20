import React, { useState, useMemo } from 'react';
import { Calendar, Clock, Play, Search, Filter, Tv, Radio, ChevronRight } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { formatTimeHHMM, formatDateVN, parseEpgDate, calculateProgramProgress } from '../utils/dateUtils';
import { generateCatchupUrl } from './VideoPlayer';

/**
 * EpgGridTimeline - Ma Trận Lịch Phát Sóng 7 Ngày Xem Lại (Catchup Matrix)
 * Tác giả: CHRTV OTT Full-stack Architect
 */
export default function EpgGridTimeline({
  channels = [],
  epgData = null,
  onPlayCatchup,
  onSelectChannel,
}) {
  const [selectedCategory, setSelectedCategory] = useState('Tất Cả');
  const [selectedDayOffset, setSelectedDayOffset] = useState(0); // 0 = Hôm nay, -1 = Hôm qua, ... -6
  const [searchQuery, setSearchQuery] = useState('');

  // Danh sách 7 ngày gần đây
  const dateTabs = useMemo(() => {
    const tabs = [];
    const now = new Date();
    for (let offset = 0; offset >= -6; offset--) {
      const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      tabs.push({
        offset,
        date: d,
        label: offset === 0 ? 'Hôm Nay' : (offset === -1 ? 'Hôm Qua' : formatDateVN(d))
      });
    }
    return tabs;
  }, []);

  // Lọc danh sách danh mục kênh
  const categories = useMemo(() => {
    const groups = new Set(['Tất Cả']);
    channels.forEach(ch => {
      if (ch.group_title) groups.add(ch.group_title);
    });
    return Array.from(groups);
  }, [channels]);

  // Lọc danh sách kênh hiển thị
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchCat = selectedCategory === 'Tất Cả' || ch.group_title === selectedCategory;
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, selectedCategory, searchQuery]);

  // Trích xuất chương trình EPG cho từng kênh dựa theo ngày được chọn
  const getProgramsForChannelAndDay = (channelId) => {
    if (!epgData || !epgData.programmes) return [];

    const targetDate = dateTabs.find(t => t.offset === selectedDayOffset)?.date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const channelProgs = epgData.programmes.filter(p => {
      if (p.channel !== channelId) return false;
      const pStart = parseEpgDate(p.start);
      return pStart >= startOfDay && pStart <= endOfDay;
    });

    // Sắp xếp theo giờ tăng dần
    return channelProgs.sort((a, b) => parseEpgDate(a.start) - parseEpgDate(b.start));
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0e12] text-slate-100 p-6 overflow-hidden">
      {/* Header & Thanh Điều Hướng EPG */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-red-500 font-bold uppercase tracking-wider text-xs mb-1">
            <Calendar className="w-4 h-4" /> Ma Trận Lịch Phát Sóng (EPG Matrix 7 Ngày)
          </div>
          <h1 className="text-2xl font-extrabold text-white">Lịch Truyền Hình & Xem Lại Catchup</h1>
        </div>

        {/* Thanh Tìm Kiếm Kênh */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm tên kênh..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-red-600 transition-colors"
          />
        </div>
      </div>

      {/* Tabs Chọn Ngày (7 Ngày) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
        {dateTabs.map((tab) => (
          <FocusableWrapper
            key={tab.offset}
            onClick={() => setSelectedDayOffset(tab.offset)}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap flex items-center gap-2 transition-all ${
              selectedDayOffset === tab.offset
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 font-bold'
                : 'bg-slate-900/80 border border-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{tab.label}</span>
          </FocusableWrapper>
        ))}
      </div>

      {/* Tabs Chọn Phân Loại Kênh */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 border-b border-slate-800/80">
        <span className="text-xs text-slate-400 font-semibold uppercase mr-2 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" /> Thể Loại:
        </span>
        {categories.map((cat) => (
          <FocusableWrapper
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-red-600/20 text-red-500 border border-red-600/50'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {cat}
          </FocusableWrapper>
        ))}
      </div>

      {/* Ma Trận Lịch Phát Sóng (EPG Timeline Grid) */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/50">
            <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Không tìm thấy kênh phù hợp với bộ lọc.</p>
          </div>
        ) : (
          filteredChannels.map((channel) => {
            const programs = getProgramsForChannelAndDay(channel.channel_id);

            return (
              <div
                key={channel.channel_id}
                className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-stretch shadow-lg"
              >
                {/* Thông tin Kênh bên trái */}
                <FocusableWrapper
                  onClick={() => onSelectChannel && onSelectChannel(channel)}
                  className="md:w-64 flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800/60 shrink-0 hover:border-red-600/50 transition-all"
                >
                  <img
                    src={channel.logo || 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'}
                    alt={channel.name}
                    className="w-12 h-12 object-contain rounded-lg bg-slate-900 p-1"
                    onError={(e) => { e.target.src = 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'; }}
                  />
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-slate-100 truncate text-sm">{channel.name}</h3>
                    <span className="text-xs text-slate-400 font-medium">{channel.group_title}</span>
                  </div>
                </FocusableWrapper>

                {/* Danh Sách Khung Giờ Chương Trình bên phải */}
                <div className="flex-1 flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {programs.length === 0 ? (
                    <div className="flex items-center justify-center p-4 text-xs text-slate-500 italic bg-slate-950/40 rounded-xl w-full">
                      Chưa cập nhật dữ liệu EPG cho ngày này.
                    </div>
                  ) : (
                    programs.map((prog, idx) => {
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
                              if (onPlayCatchup) {
                                onPlayCatchup(channel, prog, catchupUrl);
                              }
                            }
                          }}
                          className={`w-64 p-3 rounded-xl border shrink-0 flex flex-col justify-between transition-all ${
                            isLiveNow
                              ? 'bg-red-950/40 border-red-600/80 shadow-md shadow-red-600/20'
                              : isPast
                              ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                              : 'bg-slate-950/30 border-slate-900 text-slate-500'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-red-500" />
                                {formatTimeHHMM(prog.start)} - {formatTimeHHMM(prog.stop)}
                              </span>

                              {isLiveNow && (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white flex items-center gap-1">
                                  <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                                </span>
                              )}

                              {isPast && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-900/80 text-purple-300 border border-purple-700/50 flex items-center gap-0.5">
                                  <Play className="w-2.5 h-2.5 fill-current" /> Xem lại
                                </span>
                              )}
                            </div>

                            <h4 className="font-semibold text-xs text-slate-200 line-clamp-2 leading-snug">
                              {prog.title}
                            </h4>
                          </div>

                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-2">
                            {prog.desc}
                          </p>
                        </FocusableWrapper>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
