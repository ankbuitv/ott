import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const home=resolve('.toolhome');mkdirSync(home,{recursive:true});
const env={...process.env,HOME:home,XDG_CONFIG_HOME:resolve(home,'config'),WRANGLER_SEND_METRICS:'false',NO_UPDATE_NOTIFIER:'1'};
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CF_API_TOKEN','CF_API_KEY','CF_EMAIL'])delete env[key];
const binary=resolve('node_modules','wrangler','bin','wrangler.js'),config='wrangler.preview.jsonc';
// The schema is idempotent and only ever runs against Wrangler's local database.
const init=spawnSync(process.execPath,[binary,'d1','execute','VOD_DB','--local','--config',config,'--file','scripts/vod-preview.sql'],{env,stdio:'inherit'});
if(init.error||init.status!==0){console.error('Không thể khởi tạo cơ sở dữ liệu VOD local.');process.exit(init.status??1);}
const child=spawn(process.execPath,[binary,'dev','--local','--config',config,'--ip','0.0.0.0','--port','8787','--var','VEO_ENV:local','--var','ADMIN_PREVIEW:enabled'],{env,stdio:'inherit'});
child.on('error',e=>{console.error(`Không thể khởi động Worker local: ${e.message}`);process.exitCode=1;});child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
