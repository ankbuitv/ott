import {useEffect,useState} from 'react';import {parseVodDraft,type Vod,type VodDraft} from '../data/vod';
export type VodState={status:'loading'|'success'|'error';items:Vod[];hasData:boolean;message:string};
function isVod(value:unknown):value is Vod{
 if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 const parsed=parseVodDraft({title:v.title,description:v.description,category:v.category,image:v.image,source:v.source,status:v.status});
 return parsed.ok&&typeof v.id==='string'&&/^[a-z0-9-]{1,80}$/.test(v.id)&&typeof v.createdAt==='number'&&typeof v.updatedAt==='number';
}
export function useVodCatalog(admin=false){
 const [state,setState]=useState<VodState>({status:'loading',items:[],hasData:false,message:''}),[generation,setGeneration]=useState(0);
 useEffect(()=>{const controller=new AbortController();setState(old=>({...old,status:'loading',message:''}));const timer=setTimeout(()=>{controller.abort();setState(old=>({...old,status:'error',message:'Kết nối quá thời gian. Vui lòng thử lại.'}));},10000);
  void (async()=>{try{const response=await fetch(admin?'/api/demo/admin/vod':'/api/demo/vod',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('Không tải được danh sách VOD mẫu.');const data:unknown=await response.json();if(!data||typeof data!=='object'||!Array.isArray((data as {items?:unknown}).items)||!(data as {items:unknown[]}).items.every(isVod))throw new Error('Dữ liệu VOD mẫu không hợp lệ.');if(!controller.signal.aborted)setState({status:'success',items:(data as {items:Vod[]}).items,hasData:true,message:''});}catch(error){if(!controller.signal.aborted)setState(old=>({...old,status:'error',message:error instanceof Error?error.message:'Không tải được VOD mẫu.'}));}finally{clearTimeout(timer);}})();return()=>{clearTimeout(timer);controller.abort();};
 },[admin,generation]);
 return {...state,refresh:()=>setGeneration(value=>value+1)};
}
export type VodItemState={status:'loading'|'success'|'not-found'|'error';item:Vod|null;message:string};
export function useVodItem(id:string){
 const [state,setState]=useState<VodItemState>({status:'loading',item:null,message:''}),[generation,setGeneration]=useState(0);
 useEffect(()=>{const controller=new AbortController();setState({status:'loading',item:null,message:''});const timer=setTimeout(()=>{controller.abort();setState({status:'error',item:null,message:'Kết nối quá thời gian. Vui lòng thử lại.'});},10000);
  void (async()=>{try{const response=await fetch(`/api/demo/vod/${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'});if(response.status===404){if(!controller.signal.aborted)setState({status:'not-found',item:null,message:''});return;}if(!response.ok)throw new Error('Không tải được VOD mẫu.');const data:unknown=await response.json(),item=data&&typeof data==='object'?(data as {item?:unknown}).item:null;if(!isVod(item))throw new Error('Dữ liệu VOD mẫu không hợp lệ.');if(!controller.signal.aborted)setState({status:'success',item,message:''});}catch(error){if(!controller.signal.aborted)setState({status:'error',item:null,message:error instanceof Error?error.message:'Không tải được VOD mẫu.'});}finally{clearTimeout(timer);}})();return()=>{clearTimeout(timer);controller.abort();};
 },[id,generation]);
 return {...state,refresh:()=>setGeneration(value=>value+1)};
}
export async function saveVod(draft:VodDraft,id?:string){
 const response=await fetch(id?`/api/demo/admin/vod/${encodeURIComponent(id)}`:'/api/demo/admin/vod',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json','X-VEO-Preview':'local'},body:JSON.stringify(draft),cache:'no-store',signal:AbortSignal.timeout(10000)});
 const body:unknown=await response.json().catch(()=>null);if(!response.ok){const message=body&&typeof body==='object'?(body as {error?:{message?:string}}).error?.message:undefined;throw new Error(message||'Không thể lưu VOD mẫu.');}return body;
}
export async function deleteVod(id:string){
 const response=await fetch(`/api/demo/admin/vod/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'X-VEO-Preview':'local'},cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Không thể xóa VOD mẫu.');
}
