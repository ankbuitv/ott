import {spawnSync} from 'node:child_process';
// Fail closed on Wrangler deploy/dev. This PR is authorized for versions upload
// only; a real production release requires a separately reviewed configuration.
if(process.env.WRANGLER_COMMAND!=='versions upload'){
 console.error('Cấu hình này chỉ cho phép tạo Worker version, không cho phép deploy hoặc dev.');
 process.exit(1);
}
const result=spawnSync('npm',['run','build'],{stdio:'inherit',env:process.env,shell:false});
if(result.error){console.error(`Không thể build VEO: ${result.error.message}`);process.exit(1);}
process.exit(result.status??1);
