import {parseVodDraft,type Vod} from '../src/data/vod';
export interface D1Statement {bind:(...params:(string|number)[])=>D1Statement;all:<T>()=>Promise<{results:T[]}>;first:<T>()=>Promise<T|null>;run:()=>Promise<{success:boolean}>}
export interface PreviewDb {prepare:(sql:string)=>D1Statement}
export type VodEnv={VEO_ENV?:string;ADMIN_PREVIEW?:string;VOD_DB?:PreviewDb};
export function previewEnabled(env:VodEnv){return env.VEO_ENV==='local'&&env.ADMIN_PREVIEW==='enabled';}
const columns='id,title,description,category,image,source,status,created_at AS createdAt,updated_at AS updatedAt';
const idPattern=/^[a-z0-9-]{1,80}$/;
function json(body:unknown,status=200,headers?:HeadersInit){return Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});}
function fail(status:number,code:string,message:string,headers?:HeadersInit){return json({error:{code,message}},status,headers);}
function methodNotAllowed(allowed:string){return fail(405,'METHOD_NOT_ALLOWED','Phương thức không được hỗ trợ.',{allow:allowed});}
function allowedOrigin(request:Request){
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');if(request.headers.get('x-veo-preview')!=='local'||(site&&site!=='same-origin'&&site!=='none'))return false;
 if(!origin)return site==='same-origin';
 try{const o=new URL(origin),target=new URL(request.url);if(o.host!==target.host||!['http:','https:'].includes(o.protocol))return false;if(o.username||o.password)return false;if(o.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(o.hostname))return false;return true;}catch{return false;}
}
async function limitedBody(request:Request):Promise<unknown>{
 const header=request.headers.get('content-length');if(header&&(!/^\d+$/.test(header)||Number(header)>8192))throw new Error('BODY_TOO_LARGE');
 if(!request.body)throw new Error('INVALID_JSON');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('INVALID_JSON');}
}
export async function publishedVodExists(db:PreviewDb|undefined,id:string):Promise<boolean>{
 if(!db||!idPattern.test(id))return false;return !!(await db.prepare("SELECT id FROM preview_vod WHERE id = ? AND status = 'published'").bind(id).first<{id:string}>());
}
export async function handleVodApi(request:Request,env:VodEnv):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname;
 const publicMatch=/^\/api\/demo\/vod(?:\/([a-z0-9-]{1,80}))?$/.exec(path);
 const adminMatch=/^\/api\/demo\/admin\/vod(?:\/([a-z0-9-]{1,80}))?$/.exec(path);
 if(!publicMatch&&!adminMatch)return null;
 if(url.search)return fail(400,'QUERY_NOT_ALLOWED','Tham số không được hỗ trợ.');
 if(adminMatch&&!previewEnabled(env))return fail(404,'NOT_FOUND','Đường dẫn không được hỗ trợ.');
 if(env.VEO_ENV!=='local'||!env.VOD_DB)return fail(503,'VOD_DISABLED','Kho VOD mẫu chưa được kết nối.');
 const db=env.VOD_DB;
 try{
  if(publicMatch){
   if(request.method!=='GET')return methodNotAllowed('GET');
   if(publicMatch[1]){const row=await db.prepare(`SELECT ${columns} FROM preview_vod WHERE id = ? AND status = 'published'`).bind(publicMatch[1]).first<Vod>();return row?json({item:row}):fail(404,'NOT_FOUND','Không tìm thấy VOD.');}
   const rows=await db.prepare(`SELECT ${columns} FROM preview_vod WHERE status = 'published' ORDER BY created_at DESC`).all<Vod>();return json({mode:'fixture',items:rows.results});
  }
  const id=adminMatch?.[1];
  if(!id&&request.method==='GET'){const rows=await db.prepare(`SELECT ${columns} FROM preview_vod ORDER BY created_at DESC`).all<Vod>();return json({mode:'fixture',items:rows.results});}
  const validMethod=(!id&&request.method==='POST')||(!!id&&(request.method==='PUT'||request.method==='DELETE'));
  if(!validMethod)return methodNotAllowed(id?'PUT, DELETE':'GET, POST');
  if(!allowedOrigin(request))return fail(403,'ORIGIN_NOT_ALLOWED','Yêu cầu không cùng nguồn.');
  if(request.method==='DELETE'){const found=await db.prepare('SELECT id FROM preview_vod WHERE id = ?').bind(id!).first<{id:string}>();if(!found)return fail(404,'NOT_FOUND','Không tìm thấy VOD.');await db.prepare('DELETE FROM preview_vod WHERE id = ?').bind(id!).run();return json({deleted:true});}
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail(415,'UNSUPPORTED_MEDIA_TYPE','Chỉ chấp nhận JSON.');
  let payload:unknown;try{payload=await limitedBody(request);}catch(error){return fail(error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400,'INVALID_BODY','Nội dung gửi không hợp lệ hoặc quá lớn.');}
  const parsed=parseVodDraft(payload);if(!parsed.ok)return fail(400,'INVALID_VOD',parsed.message);const v=parsed.value,now=Date.now();
  if(request.method==='POST'){
   const count=await db.prepare('SELECT COUNT(*) AS count FROM preview_vod').first<{count:number}>();if((count?.count??0)>=100)return fail(409,'LIMIT_REACHED','Bản thử hỗ trợ tối đa 100 VOD.');
   const newId=`vod-${crypto.randomUUID()}`;
   await db.prepare('INSERT INTO preview_vod (id,title,description,category,image,source,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(newId,v.title,v.description,v.category,v.image,v.source,v.status,now,now).run();
   return json({item:{id:newId,...v,createdAt:now,updatedAt:now}},201);
  }
  const old=await db.prepare(`SELECT ${columns} FROM preview_vod WHERE id = ?`).bind(id!).first<Vod>();if(!old)return fail(404,'NOT_FOUND','Không tìm thấy VOD.');
  await db.prepare('UPDATE preview_vod SET title=?,description=?,category=?,image=?,source=?,status=?,updated_at=? WHERE id=?').bind(v.title,v.description,v.category,v.image,v.source,v.status,now,id!).run();
  return json({item:{...old,...v,updatedAt:now}});
 }catch{return fail(503,'VOD_UNAVAILABLE','Không thể truy cập kho VOD mẫu.');}
}
