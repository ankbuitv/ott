import React from 'react';
export default function TopNav({channels,searchQuery,setSearchQuery,user,currentProfile,setActiveTab,activeTab,onShowAuth,onSelectChannel,onSelectMovie}) {
  return <header className="h-14 bg-black/90 border-b border-slate-800 flex items-center px-4 gap-4 z-30 sticky top-0">
    <span className="font-bold text-white">CHRTV</span>
    <nav className="flex items-center gap-4 text-sm">
      {[['channels','Kênh'],['epg','EPG'],['movies','Phim'],['favorites','Yêu thích'],['history','Đã xem']].map(([k,v]) =>
        <button key={k} onClick={()=>setActiveTab(k)} className={`${activeTab===k?'text-red-500 font-bold':'text-slate-400'} text-xs uppercase`}>{v}</button>
      )}
    </nav>
    <div className="flex-1"/>
    <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Tìm..." className="bg-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"/>
    {user && <span className="text-xs text-slate-400">{user.username}</span>}
  </header>;
}