// Same-origin JSON mutations for the local preview. This is not production CSRF middleware.
export function allowedPreviewOrigin(request:Request){
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if(request.headers.get('x-veo-preview')!=='local'||(site&&site!=='same-origin'&&site!=='none'))return false;
 if(!origin)return site==='same-origin';
 try{const o=new URL(origin),target=new URL(request.url);if(o.host!==target.host||!['http:','https:'].includes(o.protocol)||o.username||o.password)return false;if(o.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(o.hostname)){
  // Wrangler's local proxy rewrites the Origin scheme to http even when an
  // Arena e2b.app preview is reached over HTTPS. Fetch Metadata + the custom
  // header still block browser cross-site mutations; this is preview-only.
  if(site!=='same-origin'||!o.hostname.endsWith('.e2b.app'))return false;
 }return true;}catch{return false;}
}
export async function limitedJson(request:Request,maxBytes=8192):Promise<unknown>{
 const header=request.headers.get('content-length');if(header&&(!/^\d+$/.test(header)||Number(header)>maxBytes))throw new Error('BODY_TOO_LARGE');
 if(!request.body)throw new Error('INVALID_JSON');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('INVALID_JSON');}
}
