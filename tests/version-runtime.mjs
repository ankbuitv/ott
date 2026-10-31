import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Compile and execute only in local Miniflare; never contact Cloudflare or upload.
const bundle=await build({entryPoints:['worker/version-entry.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false});
const options={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-07-01',
 bindings:{VEO_ENV:'local',ADMIN_PREVIEW:'enabled'},
 serviceBindings:{ASSETS:async request=>new URL(request.url).pathname==='/index.html'?new Response('<html>VEO</html>',{headers:{'content-type':'text/html'}}):new Response('not found',{status:404})}};
const mf=new Miniflare(convertV4MiniflareOptions(options));
try{
 const catalog=await mf.dispatchFetch('http://version.test/api/demo/vod');assert.equal(catalog.status,200);assert.equal(catalog.headers.get('cache-control'),'no-store');
 const data=await catalog.json();assert.equal(data.mode,'fixture');assert.equal(data.items.length,4);
 for(const [path,status] of [['/vod/demo-mien-song-lang',200],['/vod/unknown',404],['/admin',404],['/api/demo/admin/vod',404]]){
  const response=await mf.dispatchFetch(`http://version.test${path}`,{headers:{accept:'text/html'}});assert.equal(response.status,status,path);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }
 const mutation=await mf.dispatchFetch('http://version.test/api/demo/admin/vod',{method:'POST'});assert.equal(mutation.status,404);
 console.log('Worker version local runtime: danh mục mẫu, deep link và admin bị khóa: PASS');
}finally{await mf.dispose();}
