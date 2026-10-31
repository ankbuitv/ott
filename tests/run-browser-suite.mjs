// Run browser suites against a disposable, isolated D1 preview; never touch
// .wrangler/state or claim the owner's first-admin setup slot.
import {spawn} from 'node:child_process';import {createServer} from 'node:net';import {resolve} from 'node:path';import {randomUUID} from 'node:crypto';import {rm} from 'node:fs/promises';
const suites={viewer:'browser.mjs',admin:'admin-browser.mjs',vod:'vod-browser.mjs',auth:'auth-browser.mjs'};
const selected=process.argv[2];if(!suites[selected])throw new Error('Chọn viewer, admin, vod hoặc auth.');
function port(){return new Promise((yes,no)=>{const server=createServer();server.once('error',no);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(err=>err?no(err):yes(value));});});}
const ports=new Set();while(ports.size<3)ports.add(await port());
const [viewerPort,adminPort,inspectorPort]=ports,state=resolve('.cache',`browser-state-${randomUUID()}`);
const common={...process.env,VEO_LOCAL_PORT:String(viewerPort),VEO_ADMIN_PORT:String(adminPort),VEO_INSPECTOR_PORT:String(inspectorPort),VEO_LOCAL_PERSIST:state,VEO_TEST_URL:`http://127.0.0.1:${viewerPort}`,VEO_ADMIN_TEST_URL:`http://127.0.0.1:${adminPort}`,VEO_TEST_ISOLATED:'1'};
let worker,admin,workerReady,adminReady;
function start(command,pattern){
 const child=spawn(process.execPath,[command],{env:common,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',d=>{output=(output+d).slice(-12000);});child.stderr.on('data',d=>{output=(output+d).slice(-12000);});
 const ready=new Promise((ok,bad)=>{const timer=setTimeout(()=>bad(new Error(`Preview test chưa sẵn sàng: ${output.slice(-1200)}`)),90000);const check=()=>{if(pattern.test(output)){clearTimeout(timer);ok();}};child.stdout.on('data',check);child.stderr.on('data',check);child.once('exit',code=>{clearTimeout(timer);bad(new Error(`Preview test đã dừng (${code}): ${output.slice(-1200)}`));});child.once('error',bad);});
 return {child,ready};
}
function stop(proc){if(!proc||proc.exitCode!==null)return;try{if(process.platform==='win32')proc.kill('SIGTERM');else process.kill(-proc.pid,'SIGTERM');}catch{}}
async function waitExit(proc){if(!proc||proc.exitCode!==null||proc.signalCode!==null)return;await Promise.race([new Promise(ok=>proc.once('exit',ok)),new Promise(ok=>setTimeout(ok,3000))]);}
try{
 ({child:worker,ready:workerReady}=start('scripts/worker-local.mjs',/Ready on http:\/\/0\.0\.0\.0:/));
 await workerReady;
 ({child:admin,ready:adminReady}=start('scripts/admin-preview.mjs',/VEO Studio preview sẵn sàng/));
 await adminReady;
 const test=spawn(process.execPath,[`tests/${suites[selected]}`],{env:common,stdio:'inherit'});
 const code=await new Promise((ok,bad)=>{test.once('error',bad);test.once('exit',value=>ok(value??1));});if(code!==0)process.exitCode=code;
}finally{stop(admin);stop(worker);await Promise.all([waitExit(admin),waitExit(worker)]);await rm(state,{recursive:true,force:true});}
