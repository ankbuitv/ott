import React from 'react';
export function SkeletonGrid({count=6}) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({length:count}).map((_,i)=><div key={i} className="aspect-[4/3] bg-slate-800/50 rounded-2xl animate-pulse"/>)}</div>;
}
export default SkeletonGrid;
