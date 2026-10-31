import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const home=resolve('.toolhome');mkdirSync(home,{recursive:true});
const env={...process.env,HOME:home,XDG_CONFIG_HOME:resolve(home,'config'),WRANGLER_SEND_METRICS:'false',NO_UPDATE_NOTIFIER:'1'};
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CF_API_TOKEN','CF_API_KEY','CF_EMAIL'])delete env[key];
const binary=resolve('node_modules','wrangler','bin','wrangler.js'),config='wrangler.preview.jsonc';
const port=Number(process.env.VEO_LOCAL_PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Cổng local không hợp lệ.');
// Isolated browser tests may opt into an ignored .cache/ directory.
const state=process.env.VEO_LOCAL_PERSIST?resolve(process.env.VEO_LOCAL_PERSIST):'';
if(state&&!state.startsWith(`${resolve('.cache')}/`))throw new Error('Dữ liệu test phải nằm trong .cache/.');
const persistArgs=state?['--persist-to',state]:[];
const inspector=process.env.VEO_INSPECTOR_PORT?Number(process.env.VEO_INSPECTOR_PORT):0;if(inspector&&(!Number.isInteger(inspector)||inspector<1||inspector>65535))throw new Error('Cổng inspector không hợp lệ.');
const inspectorArgs=inspector?['--inspector-port',String(inspector)]:[];
// The schema is idempotent and only ever runs against Wrangler's local database.
const init=spawnSync(process.execPath,[binary,'d1','execute','VOD_DB','--local','--config',config,'--file','scripts/vod-preview.sql',...persistArgs],{env,stdio:'inherit'});
if(init.error||init.status!==0){console.error('Không thể khởi tạo cơ sở dữ liệu preview local.');process.exit(init.status??1);}
const child=spawn(process.execPath,[binary,'dev','--local','--config',config,'--ip','0.0.0.0','--port',String(port),...persistArgs,...inspectorArgs,'--var','VEO_ENV:local','--var','ADMIN_PREVIEW:enabled'],{env,stdio:'inherit'});
child.on('error',e=>{console.error(`Không thể khởi động Worker local: ${e.message}`);process.exitCode=1;});child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
