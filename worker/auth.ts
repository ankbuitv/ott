import type {PreviewDb,VodEnv} from './vod';
import {allowedPreviewOrigin,limitedJson} from './preview-http';

// Local preview only. Remote Worker version has no auth or DB binding.
// Local workerd accepts this PBKDF2 cost; production Workers may impose a lower
// cap, so this code must not be enabled remotely without a separate auth design.
const ITERATIONS=600_000,SESSION_SECONDS=8*60*60,WINDOW_MS=15*60*1000,MAX_FAILURES=5;
const COOKIE='veo_preview_session';
type Role='user'|'admin';
type Account={id:string;email:string;password_hash:string;password_salt:string;password_iterations:number;role:Role};
export type SessionUser={id:string;email:string;role:Role;emailVerified:false};
const asUser=(account:Pick<Account,'id'|'email'|'role'>):SessionUser=>({id:account.id,email:account.email,role:account.role,emailVerified:false});
const json=(body:unknown,status=200,headers?:HeadersInit)=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
const fail=(status:number,code:string,message:string,headers?:HeadersInit)=>json({error:{code,message}},status,headers);
const hex=(data:Uint8Array)=>Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
const randomHex=(size:number)=>hex(crypto.getRandomValues(new Uint8Array(size)));
const unhex=(value:string)=>Uint8Array.from(value.match(/../g)??[],pair=>parseInt(pair,16));
async function digest(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
async function derive(password:string,salt:string,iterations:number){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations},key,256)));
}
async function verifyPassword(password:string,account:Account|null){
 const salt=account?.password_salt??'0'.repeat(32),iterations=account?.password_iterations??ITERATIONS;
 if(!/^[a-f0-9]{32}$/.test(salt)||iterations!==ITERATIONS||account&&!/^[a-f0-9]{64}$/.test(account.password_hash))return false;
 const calculated=await derive(password,salt,iterations),expected=account?.password_hash??'0'.repeat(64);let difference=0;
 for(let i=0;i<64;i++)difference|=calculated.charCodeAt(i)^expected.charCodeAt(i);
 return !!account&&difference===0;
}
function cookieToken(request:Request){
 const matches=(request.headers.get('cookie')??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(`${COOKIE}=`));
 if(matches.length!==1)return null;const token=matches[0].slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token)?token:null;
}
function cookie(request:Request,value:string,maxAge:number){
 const url=new URL(request.url),loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 // Public preview hosts are HTTPS, even when the local reverse proxy connects over HTTP.
 const secure=url.protocol==='https:'||!loopback?'; Secure':'';
 return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}
async function getAccount(db:PreviewDb,email:string){return db.prepare('SELECT id,email,password_hash,password_salt,password_iterations,role FROM preview_accounts WHERE email = ?').bind(email).first<Account>();}
async function adminExists(db:PreviewDb){return !!await db.prepare("SELECT id FROM preview_accounts WHERE role = 'admin' LIMIT 1").first<{id:string}>();}
export async function sessionUser(request:Request,db:PreviewDb):Promise<SessionUser|null>{
 const token=cookieToken(request);if(!token)return null;
 const row=await db.prepare('SELECT a.id,a.email,a.role FROM preview_sessions s JOIN preview_accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await digest(token),Date.now()).first<Pick<Account,'id'|'email'|'role'>>();
 return row?asUser(row):null;
}
async function newSession(request:Request,db:PreviewDb,account:Account,status=200){
 const token=randomHex(32),now=Date.now();
 await db.prepare('DELETE FROM preview_sessions WHERE expires_at <= ?').bind(now).run();
 await db.prepare('INSERT INTO preview_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)').bind(await digest(token),account.id,now,now+SESSION_SECONDS*1000).run();
 return json({user:asUser(account),adminSetupAvailable:!await adminExists(db),mode:'local'},status,{'set-cookie':cookie(request,token,SESSION_SECONDS)});
}
function credentials(payload:unknown,allowAdmin=false):{email:string;password:string;adminOnly:boolean}|null{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;const p=payload as Record<string,unknown>;
 if(Object.keys(p).some(key=>!['email','password',...(allowAdmin?['adminOnly']:[])].includes(key)))return null;
 if(typeof p.email!=='string'||typeof p.password!=='string'||(p.adminOnly!==undefined&&typeof p.adminOnly!=='boolean'))return null;
 const email=p.email.trim().toLowerCase(),local=email.split('@')[0];
 if(email.length>254||!local||local.startsWith('.')||local.endsWith('.')||local.includes('..')||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email))return null;
 if(p.password.length<12||p.password.length>128||new TextEncoder().encode(p.password).length>256)return null;
 return {email,password:p.password,adminOnly:p.adminOnly===true};
}
async function blocked(db:PreviewDb,email:string,now:number){
 const row=await db.prepare('SELECT failures,window_started FROM preview_login_attempts WHERE email = ?').bind(email).first<{failures:number;window_started:number}>();
 return !!row&&row.failures>=MAX_FAILURES&&row.window_started>now-WINDOW_MS;
}
async function recordFailure(db:PreviewDb,email:string,now:number){
 await db.prepare('INSERT INTO preview_login_attempts (email,failures,window_started) VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET failures = CASE WHEN window_started <= ? THEN 1 ELSE failures + 1 END, window_started = CASE WHEN window_started <= ? THEN ? ELSE window_started END').bind(email,now,now-WINDOW_MS,now-WINDOW_MS,now).run();
}
async function clearFailures(db:PreviewDb,email:string){await db.prepare('DELETE FROM preview_login_attempts WHERE email = ?').bind(email).run();}
export async function handleAuthApi(request:Request,env:VodEnv):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname;
 const endpoints=['/api/demo/auth/session','/api/demo/auth/register','/api/demo/auth/login','/api/demo/auth/logout','/api/demo/auth/admin-setup'];
 if(!endpoints.includes(path))return null;
 if(env.VEO_ENV!=='local'||env.ADMIN_PREVIEW!=='enabled'||!env.VOD_DB)return fail(503,'AUTH_DISABLED','Tài khoản chỉ khả dụng trong bản xem thử local.');
 if(url.search)return fail(400,'QUERY_NOT_ALLOWED','Tham số không được hỗ trợ.');
 const db=env.VOD_DB,session=path.endsWith('/session');
 if(request.method!==(session?'GET':'POST'))return fail(405,'METHOD_NOT_ALLOWED','Phương thức không được hỗ trợ.',{allow:session?'GET':'POST'});
 if(!session&&!allowedPreviewOrigin(request))return fail(403,'ORIGIN_NOT_ALLOWED','Yêu cầu không cùng nguồn.');
 try{
  if(session)return json({user:await sessionUser(request,db),adminSetupAvailable:!await adminExists(db),mode:'local'});
  if(path.endsWith('/logout')){const token=cookieToken(request);if(token)await db.prepare('DELETE FROM preview_sessions WHERE token_hash = ?').bind(await digest(token)).run();return json({ok:true},200,{'set-cookie':cookie(request,'',0)});}
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail(415,'UNSUPPORTED_MEDIA_TYPE','Chỉ chấp nhận JSON.');
  let payload:unknown;try{payload=await limitedJson(request);}catch(e){return fail(e instanceof Error&&e.message==='BODY_TOO_LARGE'?413:400,'INVALID_BODY','Nội dung gửi không hợp lệ hoặc quá lớn.');}
  const input=credentials(payload,path.endsWith('/login'));if(!input)return fail(400,'INVALID_CREDENTIALS','Email hợp lệ và mật khẩu từ 12 đến 128 ký tự là bắt buộc.');
  const {email,password}=input,now=Date.now(),account=await getAccount(db,email);
  if(path.endsWith('/login')){
   if(await blocked(db,email,now))return fail(429,'TRY_LATER','Có quá nhiều lần thử. Vui lòng thử lại sau 15 phút.');
   if(!await verifyPassword(password,account)){await recordFailure(db,email,now);return fail(401,'INVALID_LOGIN','Email hoặc mật khẩu không đúng.');}
   await clearFailures(db,email);if(input.adminOnly&&account!.role!=='admin')return fail(403,'ADMIN_REQUIRED','Tài khoản không có quyền quản trị.');
   return await newSession(request,db,account!);
  }
  if(path.endsWith('/register')){
   if(account)return fail(409,'EMAIL_IN_USE','Email đã được đăng ký trong bản thử.');
   const count=await db.prepare('SELECT COUNT(*) AS count FROM preview_accounts').first<{count:number}>();if((count?.count??0)>=100)return fail(409,'LIMIT_REACHED','Bản thử hỗ trợ tối đa 100 tài khoản.');
   const salt=randomHex(16),hash=await derive(password,salt,ITERATIONS),id=crypto.randomUUID();
   try{await db.prepare('INSERT INTO preview_accounts (id,email,password_hash,password_salt,password_iterations,role,created_at) VALUES (?,?,?,?,?,\'user\',?)').bind(id,email,hash,salt,ITERATIONS,now).run();}
   catch{if(await getAccount(db,email))return fail(409,'EMAIL_IN_USE','Email đã được đăng ký trong bản thử.');throw new Error('INSERT_FAILED');}
   return await newSession(request,db,{id,email,password_hash:hash,password_salt:salt,password_iterations:ITERATIONS,role:'user'},201);
  }
  // Exactly one local admin can be claimed. A DB unique index and conditional
  // update enforce this even if several setup requests arrive together.
  if(await adminExists(db))return fail(409,'SETUP_CLOSED','Admin đã được thiết lập.');
  let admin:Account;
  if(account){
   if(await blocked(db,email,now))return fail(429,'TRY_LATER','Có quá nhiều lần thử. Vui lòng thử lại sau 15 phút.');
   if(!await verifyPassword(password,account)){await recordFailure(db,email,now);return fail(401,'INVALID_LOGIN','Email hoặc mật khẩu không đúng.');}
   try{await db.prepare("UPDATE preview_accounts SET role = 'admin' WHERE id = ? AND role = 'user' AND NOT EXISTS (SELECT 1 FROM preview_accounts WHERE role = 'admin')").bind(account.id).run();}
   catch{if(await adminExists(db))return fail(409,'SETUP_CLOSED','Admin đã được thiết lập.');throw new Error('SETUP_FAILED');}
   const promoted=await getAccount(db,email);if(!promoted||promoted.role!=='admin')return fail(409,'SETUP_CLOSED','Admin đã được thiết lập.');
   await db.prepare('DELETE FROM preview_sessions WHERE account_id = ?').bind(account.id).run();await clearFailures(db,email);admin=promoted;
  }else{
   const salt=randomHex(16),hash=await derive(password,salt,ITERATIONS),id=crypto.randomUUID();
   try{await db.prepare("INSERT INTO preview_accounts (id,email,password_hash,password_salt,password_iterations,role,created_at) VALUES (?,?,?,?,?,'admin',?)").bind(id,email,hash,salt,ITERATIONS,now).run();}
   catch{if(await adminExists(db))return fail(409,'SETUP_CLOSED','Admin đã được thiết lập.');if(await getAccount(db,email))return fail(409,'EMAIL_IN_USE','Email đã được đăng ký. Thử lại với mật khẩu của tài khoản đó.');throw new Error('SETUP_FAILED');}
   admin={id,email,password_hash:hash,password_salt:salt,password_iterations:ITERATIONS,role:'admin'};
  }
  return await newSession(request,db,admin,201);
 }catch{return fail(503,'AUTH_UNAVAILABLE','Không thể truy cập dịch vụ tài khoản của bản thử.');}
}
