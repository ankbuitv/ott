import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * SCROLL ROW — danh sách cuộn ngang có NÚB MŨI TÊN TRÁI/PHẢI (như banner trang chủ).
 * Tự ẩn nút khi đang ở đầu/cuối danh sách; cuộn mượt ~85% bề rộng; hỗ trợ cả
 * chuột, cảm ứng (vuốt như cũ) và TV/D-pad (nút là node focusable).
 *
 * Dùng thay cho <div className="flex gap-3 overflow-x-auto scrollbar-none ...">:
 *   <ScrollRow>{items.map(...)}</ScrollRow>
 */
export default function ScrollRow({ children, className = '', btnSize = 'w-9 h-9' }) {
  const ref = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 8);
    // chưa tràn nội dung (ít item) -> coi như đã ở cuối, ẩn cả 2 nút
    setAtEnd(el.scrollWidth - el.clientWidth <= 8 || el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    // cập nhật lại khi children thay đổi (dữ liệu tải xong sau khi mount)
    const raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [children, update]);

  useEffect(() => {
    // cửa sổ đổi kích thước / layout đổ lại -> tính lại vị trí nút
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const scrollBy1 = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(260, el.clientWidth * 0.85), behavior: 'smooth' });
  };

  const btn = (dir, Icon, extra) => (
    <button
      type="button"
      aria-label={dir < 0 ? 'Cuộn trái' : 'Cuộn phải'}
      onClick={() => scrollBy1(dir)}
      className={`${btnSize} absolute top-1/2 -translate-y-1/2 z-30 rounded-full bg-black/75 hover:bg-black border border-white/20 backdrop-blur-sm text-white flex items-center justify-center shadow-xl transition-all active:scale-90 opacity-0 group-hover/hrow:opacity-100 focus-visible:opacity-100 ${extra}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );

  return (
    <div className={`relative group/hrow ${className}`}>
      <div ref={ref} onScroll={update} className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x scroll-smooth">
        {children}
      </div>
      {!atStart && btn(-1, ChevronLeft, '-left-2 md:-left-4')}
      {!atEnd && btn(1, ChevronRight, '-right-2 md:-right-4')}
    </div>
  );
}
