import React from 'react';

export default function LiveStrip() {
  return (
    <div className="bg-gradient-to-r from-red-600 via-red-700 to-rose-700 py-1.5 px-6 flex items-center gap-3 text-xs shrink-0">
      <span className="live-dot"></span>
      <span className="font-bold tracking-wider">KÊNH ĐANG TRỰC TIẾP</span>
      <span className="opacity-90 hidden md:inline">· VTV1 · VTV3 · HTV7 · ON Sports</span>
      <span className="ml-auto opacity-80 hidden md:inline">Cập nhật vừa xong</span>
    </div>
  );
}