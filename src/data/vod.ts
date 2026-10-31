/** VOD preview accepts only synthetic media packaged with VEO. */
export const VOD_CATEGORIES=['Khám phá','Đời sống','Phim','Giải trí','Thể thao'];
export const VOD_POSTERS=[{value:'/images/film-coast.jpg',label:'Miền biển'},{value:'/images/film-city.jpg',label:'Thành phố'},{value:'/images/film-mountain.jpg',label:'Núi rừng'},{value:'/images/film-stadium.jpg',label:'Sân vận động'},{value:'/images/hero-ha-long.jpg',label:'Vịnh Hạ Long'}] as const;
export const VOD_SOURCES=[{value:'hls',label:'Video mẫu HLS'},{value:'dash',label:'Video mẫu DASH'},{value:'mp4',label:'Video mẫu MP4'}] as const;
export type VodSource=(typeof VOD_SOURCES)[number]['value'];
export type VodStatus='published'|'draft';
export type VodDraft={title:string;description:string;category:string;image:string;source:VodSource;status:VodStatus};
export type Vod=VodDraft&{id:string;createdAt:number;updatedAt:number};
export type VodParseResult={ok:true;value:VodDraft}|{ok:false;message:string};
export function parseVodDraft(input:unknown):VodParseResult{
 if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,message:'Dữ liệu VOD không hợp lệ.'};
 const v=input as Record<string,unknown>,keys=['title','description','category','image','source','status'];
 if(Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>typeof v[k]!=='string'))return{ok:false,message:'Dữ liệu VOD không hợp lệ.'};
 const title=(v.title as string).trim(),description=(v.description as string).trim();
 if(!title||title.length>80)return{ok:false,message:'Tên VOD cần từ 1 đến 80 ký tự.'};
 if(!description||description.length>400)return{ok:false,message:'Mô tả VOD cần từ 1 đến 400 ký tự.'};
 if(/https?:\/\/|[?&](token|signature|key)=/i.test(`${title} ${description}`))return{ok:false,message:'Không nhập URL, token hoặc thông tin nhạy cảm vào bản thử.'};
 if(!VOD_CATEGORIES.includes(v.category as string))return{ok:false,message:'Vui lòng chọn thể loại hợp lệ.'};
 if(!VOD_POSTERS.some(x=>x.value===v.image)||!VOD_SOURCES.some(x=>x.value===v.source))return{ok:false,message:'Bản thử chỉ hỗ trợ ảnh và video mẫu có sẵn.'};
 if(v.status!=='published'&&v.status!=='draft')return{ok:false,message:'Trạng thái VOD không hợp lệ.'};
 return{ok:true,value:{title,description,category:v.category as string,image:v.image as string,source:v.source as VodSource,status:v.status as VodStatus}};
}
