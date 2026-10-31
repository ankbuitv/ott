import {channels,type Channel} from '../data/fixtures';

/** This data model is for a browser-only preview. It is not an admin API. */
export type StudioStatus='sample'|'draft';
export type StudioChannel=Channel & {status:StudioStatus};
export type ChannelDraft=Pick<StudioChannel,'number'|'name'|'category'|'now'|'next'|'status'>;
type ReadStorage=Pick<Storage,'getItem'>;
type WriteStorage=Pick<Storage,'setItem'>;
export const STUDIO_STORAGE_KEY='veo:studio:channels:v1';
export const STUDIO_CATEGORIES=['Tổng hợp','Khám phá','Giải trí','Thể thao','Phim','Đời sống','Thiếu nhi','Âm nhạc'];
const tones=new Set(['mint','coral','sky','violet','gold','rose','teal','slate']);
const images=new Set(['/images/hero-ha-long.jpg','/images/film-city.jpg','/images/film-stadium.jpg','/images/film-coast.jpg','/images/film-mountain.jpg']);
export function initialChannels():StudioChannel[]{return channels.map(channel=>({...channel,status:'sample'}));}
export function normalizeNumber(number:string){return number.trim().padStart(2,'0');}
export function simplify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLocaleLowerCase('vi');}
export function validateChannel(draft:ChannelDraft,existing:StudioChannel[],editingId?:string):string|null{
 const number=draft.number.trim();
 if(!/^\d{1,3}$/.test(number))return 'Số kênh cần có từ 1 đến 3 chữ số.';
 if(existing.some(c=>c.id!==editingId&&normalizeNumber(c.number)===normalizeNumber(number)))return 'Số kênh đã có trong danh sách mẫu.';
 if(!draft.name.trim()||draft.name.trim().length>60)return 'Tên kênh cần có từ 1 đến 60 ký tự.';
 if(!STUDIO_CATEGORIES.includes(draft.category))return 'Vui lòng chọn thể loại hợp lệ.';
 if(!draft.now.trim()||draft.now.trim().length>80||!draft.next.trim()||draft.next.trim().length>80)return 'Nhập tên hai chương trình mẫu, tối đa 80 ký tự mỗi tên.';
 if(draft.status!=='sample'&&draft.status!=='draft')return 'Trạng thái không hợp lệ.';
 return null;
}
function isChannel(value:unknown):value is StudioChannel{
 if(!value||typeof value!=='object')return false;
 const c=value as Record<string,unknown>;
 return typeof c.id==='string'&&c.id.length>0&&c.id.length<=80&&typeof c.number==='string'&&/^\d{1,3}$/.test(c.number)&&typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=60&&typeof c.category==='string'&&STUDIO_CATEGORIES.includes(c.category)&&typeof c.now==='string'&&c.now.length>0&&c.now.length<=80&&typeof c.next==='string'&&c.next.length>0&&c.next.length<=80&&typeof c.tone==='string'&&tones.has(c.tone)&&typeof c.image==='string'&&images.has(c.image)&&(c.status==='sample'||c.status==='draft');
}
export function loadChannels(storage?:ReadStorage):StudioChannel[]{
 if(!storage)return initialChannels();
 try{
  const raw=storage.getItem(STUDIO_STORAGE_KEY);if(raw===null)return initialChannels();
  const data:unknown=JSON.parse(raw);
  if(Array.isArray(data)&&data.length<=100&&data.every(isChannel)&&new Set(data.map(c=>c.id)).size===data.length&&new Set(data.map(c=>normalizeNumber(c.number))).size===data.length)return data;
 }catch{/* Corrupt/unavailable session storage is ignored. */}
 return initialChannels();
}
export function saveChannels(storage:WriteStorage|undefined,items:StudioChannel[]):boolean{
 if(!storage)return false;
 try{storage.setItem(STUDIO_STORAGE_KEY,JSON.stringify(items));return true;}catch{return false;}
}
export function nextNumber(items:StudioChannel[]):string{
 const used=new Set(items.map(c=>normalizeNumber(c.number)));
 for(let i=1;i<=999;i++){const n=String(i).padStart(2,'0');if(!used.has(n))return n;}
 return '';
}
