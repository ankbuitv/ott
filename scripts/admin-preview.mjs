import http from 'node:http';
// Local preview adapter: loopback upstream and a narrow, same-origin VOD/auth write allowlist.
const port=Number(process.env.VEO_ADMIN_PORT??8788),viewerPort=Number(process.env.VEO_LOCAL_PORT??8787);
if(!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(viewerPort)||viewerPort<1||viewerPort>65535)throw new Error('Cổng preview không hợp lệ.');
function sameOrigin(req){
 try{const raw=req.headers.origin,host=req.headers.host,site=req.headers['sec-fetch-site'];if(!host||req.headers['x-veo-preview']!=='local'||(site&&site!=='same-origin'&&site!=='none'))return false;if(!raw)return site==='same-origin';const origin=new URL(raw);if(origin.host!==host)return false;if(!['http:','https:'].includes(origin.protocol))return false;if(origin.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))return false;return true;}catch{return false;}
}
const server=http.createServer((req,res)=>{
 const raw=req.url??'/';if(!raw.startsWith('/')||raw.startsWith('//')){res.writeHead(400,{'Cache-Control':'no-store'}).end();return;}
 let url;try{url=new URL(raw,'http://preview.invalid');}catch{res.writeHead(400,{'Cache-Control':'no-store'}).end();return;}
 const read=['GET','HEAD'].includes(req.method??'');
 const create=req.method==='POST'&&url.pathname==='/api/demo/admin/vod';
 const edit=['PUT','DELETE'].includes(req.method??'')&&/^\/api\/demo\/admin\/vod\/[a-z0-9-]{1,80}$/.test(url.pathname);
 const auth=req.method==='POST'&&/^\/api\/demo\/auth\/(register|login|logout|admin-setup)$/.test(url.pathname);
 if(!read&&!create&&!edit&&!auth){res.writeHead(405,{Allow:'GET, HEAD','Cache-Control':'no-store'}).end();return;}
 if(!read&&!sameOrigin(req)){res.writeHead(403,{'Cache-Control':'no-store'}).end();return;}
 if(url.pathname==='/'){res.writeHead(302,{Location:'/admin','Cache-Control':'no-store'}).end();return;}
 const headers={...req.headers};delete headers.connection;delete headers['proxy-connection'];
 const upstream=http.request({hostname:'127.0.0.1',port:viewerPort,method:req.method,path:`${url.pathname}${url.search}`,headers},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});
 upstream.setTimeout(10000,()=>upstream.destroy(new Error('Preview Worker timed out')));
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Worker xem thử chưa sẵn sàng.');});
 req.on('aborted',()=>upstream.destroy());if(read)upstream.end();else req.pipe(upstream);
});
server.listen(port,'0.0.0.0',()=>console.log(`VEO Studio preview sẵn sàng trên cổng ${port}`));
