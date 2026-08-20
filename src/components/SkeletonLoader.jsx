import React from 'react';

function SkeletonLine({ className = '' }) {
  return <div className={`bg-slate-800/60 rounded animate-pulse ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl bg-[#13151c] border border-slate-800/40 p-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <SkeletonLine className="w-12 h-12 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <SkeletonLine className="w-16 h-2" />
          <SkeletonLine className="w-28 h-3" />
        </div>
      </div>
      <SkeletonLine className="w-full h-14 rounded-lg" />
    </div>
  );
}

export function SkeletonGrid({ count = 12 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonEPG() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-[#13151c] border border-slate-800/40 rounded-xl p-3 flex gap-3">
          <SkeletonLine className="w-14 h-14 rounded-lg shrink-0" />
          <div className="flex-1 flex gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <SkeletonLine key={j} className="w-48 h-20 rounded-lg shrink-0" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
