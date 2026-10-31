import {channels,movies,shorts} from '../src/data/fixtures';
import {handleVodApi,previewEnabled,publishedVodExists,type PreviewDb} from './vod';
type Env={ASSETS:{fetch:(request:Request)=>Promise<Response>};VEO_ENV?:string;FRAME_GUARD?:string;ADMIN_PREVIEW?:string;VOD_DB?:PreviewDb};
const pages=new Set(['/admin','/admin/kenh','/admin/vod','/admin/noi-dung','/admin/lich-phat-song','/admin/tai-khoan','/admin/cai-dat','/','/truyen-hinh','/lich-phat-song','/phim','/vod','/the-thao','/shorts','/yeu-thich','/thong-bao','/tai-khoan','/cai-dat','/hoi-vien','/tim-kiem']);
async function known(path:string,env:Env){
 if(pages.has(path))return true;
 const movie=/^\/phim\/([a-z0-9-]+)$/.exec(path);if(movie)return movies.some(x=>x.id===movie[1]);
 const short=/^\/shorts\/([a-z0-9-]+)$/.exec(path);if(short)return shorts.some(x=>x.id===short[1]);
 const vod=/^\/vod\/([a-z0-9-]{1,80})$/.exec(path);return !!vod&&env.VEO_ENV==='local'&&await publishedVodExists(env.VOD_DB,vod[1]);
}
function error(status:number,code:string,message:string){return new Response(JSON.stringify({error:{code,message}}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function secured(response:Response,env:Env,html=false){const headers=new Headers(response.headers);headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');headers.set('permissions-policy','camera=(), microphone=(), geolocation=(), payment=()');const frame=env.FRAME_GUARD==='deny'?"; frame-ancestors 'none'":'';headers.set('content-security-policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'${frame}`);if(html||response.status>=400)headers.set('cache-control','no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
async function api(request:Request,env:Env){
 const vod=await handleVodApi(request,env);if(vod)return vod;
 const url=new URL(request.url),allowed=new Set(['/api/demo/health','/api/demo/catalog','/api/v1/catalog/channels','/api/v1/catalog/movies','/api/auth/email/request-code','/api/auth/email/verify-code']);if(!allowed.has(url.pathname))return error(404,'NOT_FOUND','Đường dẫn không được hỗ trợ.');
 if(url.pathname.startsWith('/api/auth/')){if(request.method!=='POST'){const r=error(405,'METHOD_NOT_ALLOWED','Phương thức không được hỗ trợ.');r.headers.set('allow','POST');return r;}return error(503,'AUTH_DISABLED','Đăng nhập email chưa được kết nối.');}
 if(request.method!=='GET'){const r=error(405,'METHOD_NOT_ALLOWED','Phương thức không được hỗ trợ.');r.headers.set('allow','GET');return r;}if(url.search)return error(400,'QUERY_NOT_ALLOWED','Tham số không được hỗ trợ.');if(url.pathname==='/api/demo/health')return Response.json({status:'ok',mode:'fixture'},{headers:{'cache-control':'no-store'}});if(url.pathname==='/api/demo/catalog')return Response.json({mode:'fixture',channels,movies,shorts},{headers:{'cache-control':'no-store'}});return error(503,'UPSTREAM_NOT_CONFIGURED','Chưa có dịch vụ dữ liệu được phê duyệt.');
}
export default {async fetch(request:Request,env:Env){
 const url=new URL(request.url);
 if((url.pathname==='/admin'||url.pathname.startsWith('/admin/'))&&!previewEnabled(env))return secured(error(404,'NOT_FOUND','Đường dẫn không được hỗ trợ.'),env);
 if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return secured(await api(request,env),env);
 if(request.method!=='GET'&&request.method!=='HEAD')return secured(error(405,'METHOD_NOT_ALLOWED','Phương thức không được hỗ trợ.'),env);
 const asset=await env.ASSETS.fetch(request);if(asset.status!==404)return secured(asset,env,asset.headers.get('content-type')?.includes('text/html')??false);
 if(!request.headers.get('accept')?.includes('text/html'))return secured(asset,env);
 const index=await env.ASSETS.fetch(new Request(new URL('/index.html',url),{method:request.method,headers:{accept:'text/html'}}));if(!index.ok)return secured(index,env,true);
 let exists:boolean;try{exists=await known(url.pathname,env);}catch{return secured(error(503,'VOD_UNAVAILABLE','Không thể truy cập kho VOD mẫu.'),env);}
 return secured(new Response(request.method==='HEAD'?null:index.body,{status:exists?200:404,headers:index.headers}),env,true);
}};
