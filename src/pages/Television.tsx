import {useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,CalendarDays,Clock3,Radio,Search,Tv2,X} from 'lucide-react';
import {DemoPlayer} from '../components/Player';
import {FavoriteButton} from '../components/Media';
import {channels,type Channel} from '../data/fixtures';
import {vnDate,vnTime} from '../lib/time';
import './television.css';

/** Logos and programming are fictional fixtures, not broadcaster assets. */
function StationMark({channel}:{channel:Channel}){
 return <span className={`station-logo ${channel.tone}`}><span>VEO</span><strong>{channel.number}</strong></span>;
}
function simplify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLocaleLowerCase('vi');}
export function TelevisionPage(){
 const [params,setParams]=useSearchParams();
 const [panel,setPanel]=useState<'channels'|'schedule'>('channels');
 const [category,setCategory]=useState('Tất cả');
 const [search,setSearch]=useState('');
 const selected=channels.find(c=>c.id===params.get('kenh'))??channels[0];
 const filters=['Tất cả',...new Set(channels.map(c=>c.category))];
 const query=simplify(search.trim());
 const visible=channels.filter(c=>(category==='Tất cả'||category===c.category)&&(!query||simplify(`${c.name} ${c.category} ${c.now} ${c.number}`).includes(query)));
 function choose(channel:Channel){setParams({kenh:channel.id});}
 return <div className="page television-page">
  <div className="page-intro television-intro"><div><h1>Truyền hình</h1><p>Một chạm chuyển kênh, mở ra nhiều điều thú vị.</p></div><span className="demo-indicator"><span/> DỮ LIỆU MÔ PHỎNG</span></div>
  <section className="channel-ribbon" aria-label="Chọn nhanh kênh minh họa">
   <div className="ribbon-title"><span className="ribbon-title-icon"><Tv2 size={18}/></span><span><strong>KÊNH MẪU</strong><small>Chọn nhanh</small></span></div>
   <div className="ribbon-scroll">{channels.map(c=><button key={c.id} className={`ribbon-station${selected.id===c.id?' selected':''}`} type="button" data-channel={c.id} aria-pressed={selected.id===c.id} onClick={()=>choose(c)}><StationMark channel={c}/><span className="ribbon-category">{c.category}</span></button>)}</div>
  </section>
  <div className="television-layout">
   <div className="television-main">
    <DemoPlayer label={`${selected.name} · video thử`}/>
    <div className="now-info"><div><div className="eyebrow-status"><span/> ĐANG MÔ PHỎNG</div><h2>{selected.now}</h2><p>{selected.name} <span>•</span> {selected.category}</p></div><FavoriteButton id={`channel:${selected.id}`} title={selected.name}/></div>
    <div className="notice-box"><Radio size={19}/><p>Các kênh đều dùng cùng một video mẫu, không phải tín hiệu truyền hình hoặc lịch phát sóng thực tế.</p></div>
   </div>
   <aside className="channel-panel" aria-labelledby="channel-panel-heading">
    <div className="channel-panel-heading"><div><span className="panel-eyebrow">KHÁM PHÁ TRUYỀN HÌNH</span><h2 id="channel-panel-heading">Danh sách kênh</h2><p>{channels.length} kênh minh họa</p></div><span className="channel-panel-icon"><Tv2 size={20}/></span></div>
    <div className="channel-panel-tabs" role="group" aria-label="Chọn nội dung bảng kênh"><button type="button" className={panel==='channels'?'selected':''} aria-pressed={panel==='channels'} onClick={()=>setPanel('channels')}>Chuyển kênh</button><button type="button" className={panel==='schedule'?'selected':''} aria-pressed={panel==='schedule'} onClick={()=>setPanel('schedule')}>Lịch phát sóng</button></div>
    {panel==='channels'?<>
     <label className="channel-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Tìm kênh minh họa</span><input value={search} onChange={e=>setSearch(e.target.value)} type="search" placeholder="Tìm kênh hoặc thể loại..."/></label>
     <div className="channel-filters" role="group" aria-label="Lọc kênh theo thể loại">{filters.map(f=><button key={f} type="button" onClick={()=>setCategory(f)} aria-pressed={category===f} className={category===f?'selected':''}>{f}</button>)}</div>
     {visible.length?<div className="station-grid">{visible.map(c=><button type="button" key={c.id} className={`station-card${selected.id===c.id?' selected':''}`} aria-pressed={selected.id===c.id} onClick={()=>choose(c)}><span className="station-card-top"><StationMark channel={c}/>{selected.id===c.id?<span className="station-playing"><i/><i/><i/><span className="sr-only">Đang chọn</span></span>:<span className="station-number">{c.number}</span>}</span><strong>{c.name}</strong><small>{c.now}</small><span className="station-category">{c.category}</span></button>)}</div>:<p className="channel-empty" role="status">Không tìm thấy kênh. Hãy thử từ khóa hoặc thể loại khác.</p>}
    </>:<div className="schedule-preview"><div className="schedule-heading"><CalendarDays size={17}/><div><strong>Hôm nay</strong><span>{vnDate(new Date())}</span></div><span className="schedule-demo">LỊCH MẪU</span></div><p className="schedule-channel">{selected.name} <span>·</span> {selected.category}</p><div className="schedule-entry current"><span>HIỆN TẠI · MÔ PHỎNG</span><strong>{selected.now}</strong><small>Chương trình minh họa</small></div><div className="schedule-entry"><span>TIẾP THEO</span><strong>{selected.next}</strong><small>Chương trình minh họa</small></div><p className="schedule-note">Thông tin chỉ để trải nghiệm, không phải lịch phát sóng thực tế.</p></div>}
    <Link to="/lich-phat-song" className="channel-guide-link">Xem lịch phát sóng mẫu <ArrowRight size={15}/></Link>
   </aside>
  </div>
 </div>;
}
type Program={title:string;channel:string;time:string};
export function GuidePage(){const [day,setDay]=useState(0);const [selected,setSelected]=useState<Program|null>(null);const dialog=useRef<HTMLDialogElement>(null);const base=new Date(Date.now()+day*86_400_000);base.setMinutes(0,0,0);const next=new Date(base.getTime()+3_600_000),later=new Date(base.getTime()+7_200_000);function show(p:Program){setSelected(p);dialog.current?.showModal();}return <div className="page"><div className="page-intro"><div><h1>Lịch phát sóng</h1><p>Tìm điều thú vị cho khoảng thời gian của bạn.</p></div><span className="demo-indicator"><span/> LỊCH MINH HỌA</span></div><div className="guide-top"><div><h2>Lịch theo kênh</h2><p>Giờ hiển thị theo múi giờ Việt Nam (UTC+7)</p></div><div className="segmented" aria-label="Chọn ngày">{[0,1].map(v=><button key={v} onClick={()=>setDay(v)} aria-pressed={day===v} className={day===v?'selected':''}>{v===0?'Hôm nay':'Ngày mai'}</button>)}</div></div><div className="date-line"><CalendarDays size={17}/> {vnDate(base)}</div><div className="guide-table-wrap"><table className="guide-table"><thead><tr><th scope="col">Kênh</th><th scope="col">{vnTime(base)}</th><th scope="col">{vnTime(next)}</th><th scope="col">{vnTime(later)}</th></tr></thead><tbody>{channels.map(c=><tr key={c.id}><th scope="row"><span className="guide-channel"><span className={`channel-mark ${c.tone}`}>{c.number}</span><span>{c.name}<small>{c.category}</small></span></span></th>{[c.now,c.next,'Khoảnh khắc mỗi ngày'].map((title,i)=><td key={i}><button onClick={()=>show({title,channel:c.name,time:vnTime(new Date(base.getTime()+i*3_600_000))})}><strong>{title}</strong><small>{i===0&&day===0?'Đang mô phỏng':'Chương trình mẫu'}</small></button></td>)}</tr>)}</tbody></table></div><div className="notice-box guide-notice"><Clock3 size={18}/><p>Lịch trên là dữ liệu thử, không phản ánh lịch phát sóng thực tế.</p></div><dialog ref={dialog} className="content-dialog" onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}><div className="dialog-header"><h2>Chi tiết chương trình mẫu</h2><button onClick={()=>dialog.current?.close()} className="icon-button" aria-label="Đóng"><X size={20}/></button></div>{selected&&<div className="dialog-body"><h3>{selected.title}</h3><p>{selected.channel} · {selected.time} (UTC+7)</p><p>Thông tin mô phỏng, chưa có dữ liệu chương trình thật.</p><button className="button button-secondary" onClick={()=>dialog.current?.close()}>Đóng</button></div>}</dialog><Link to="/truyen-hinh" className="back-inline"><ArrowLeft size={15}/> Trở lại truyền hình</Link></div>;}
