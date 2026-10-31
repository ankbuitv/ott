import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import worker from '../worker/index';import versionWorker from '../worker/version-entry';import type {PreviewDb} from '../worker/vod';
const schema=readFileSync(new URL('../scripts/vod-preview.sql',import.meta.url),'utf8');
const assets={fetch:async()=>new Response('not found',{status:404})};
const password='local-only-example-password';let sqlite:DatabaseSync,db:PreviewDb;
const env=()=>({ASSETS:assets,VEO_ENV:'local',ADMIN_PREVIEW:'enabled',VOD_DB:db});
function req(path:string,method='GET',body?:unknown,extra:Record<string,string>={}){return new Request(`https://preview.example${path}`,{method,headers:{...(method==='GET'?{}:{origin:'https://preview.example','sec-fetch-site':'same-origin','x-veo-preview':'local','content-type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const call=(path:string,method='GET',body?:unknown,headers?:Record<string,string>)=>worker.fetch(req(path,method,body,headers),env());
const pair=(response:Response)=>(response.headers.get('set-cookie')??'').split(';')[0];
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);db={prepare(sql){const stmt=sqlite.prepare(sql);let params:(string|number)[]=[];return{bind(...values){params=values;return this;},async all<T>(){return{results:stmt.all(...params) as T[]};},async first<T>(){return(stmt.get(...params)??null) as T|null;},async run(){stmt.run(...params);return{success:true};}};}};});afterEach(()=>sqlite.close());
describe('Tài khoản preview local, không gửi email',()=>{
 it('đăng ký user, băm mật khẩu bằng salt riêng, không tự thành admin',async()=>{
  const first=await call('/api/demo/auth/register','POST',{email:'User1@example.test',password});expect(first.status).toBe(201);
  const payload=await first.json() as {user:{email:string;role:string;emailVerified:boolean}};expect(payload.user).toMatchObject({email:'user1@example.test',role:'user',emailVerified:false});
  expect(first.headers.get('cache-control')).toBe('no-store');expect(first.headers.get('set-cookie')).toContain('HttpOnly');expect(first.headers.get('set-cookie')).toContain('SameSite=Strict');expect(first.headers.get('set-cookie')).toContain('Secure');
  expect((await call('/api/demo/admin/vod','GET',undefined,{cookie:pair(first)})).status).toBe(403);
  expect((await call('/api/demo/auth/register','POST',{email:'USER1@example.test',password})).status).toBe(409);
  expect((await call('/api/demo/auth/register','POST',{email:'user2@example.test',password})).status).toBe(201);
  const records=sqlite.prepare('SELECT password_hash,password_salt,password_iterations FROM preview_accounts ORDER BY email').all() as {password_hash:string;password_salt:string;password_iterations:number}[];
  expect(records[0].password_hash).not.toContain(password);expect(records[0].password_hash).not.toBe(records[1].password_hash);expect(records[0].password_salt).not.toBe(records[1].password_salt);expect(records[0].password_iterations).toBe(600000);
  const raw=pair(first).split('=')[1];expect(sqlite.prepare('SELECT token_hash FROM preview_sessions WHERE token_hash=?').get(raw)).toBeUndefined();
 });
 it('thiết lập admin một lần, xác thực tài khoản có sẵn và thu hồi phiên cũ',async()=>{
  const register=await call('/api/demo/auth/register','POST',{email:'owner@example.test',password});const oldCookie=pair(register);
  expect(((await (await call('/api/demo/auth/session')).json()) as {adminSetupAvailable:boolean}).adminSetupAvailable).toBe(true);
  expect((await call('/api/demo/auth/admin-setup','POST',{email:'owner@example.test',password:'incorrect-password-for-test'})).status).toBe(401);
  const setup=await call('/api/demo/auth/admin-setup','POST',{email:'owner@example.test',password});expect(setup.status).toBe(201);
  const newCookie=pair(setup);expect(((await setup.json()) as {user:{role:string}}).user.role).toBe('admin');
  expect((await call('/api/demo/admin/vod','GET',undefined,{cookie:oldCookie})).status).toBe(401);
  expect((await call('/api/demo/admin/vod','GET',undefined,{cookie:newCookie})).status).toBe(200);
  expect((await call('/api/demo/auth/admin-setup','POST',{email:'other@example.test',password})).status).toBe(409);
  expect(((await (await call('/api/demo/auth/session')).json()) as {adminSetupAvailable:boolean}).adminSetupAvailable).toBe(false);
 });
 it('setup đồng thời chỉ có một admin',async()=>{
  const responses=await Promise.all(['first@example.test','second@example.test'].map(email=>call('/api/demo/auth/admin-setup','POST',{email,password})));
  expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
  expect((sqlite.prepare("SELECT COUNT(*) AS n FROM preview_accounts WHERE role='admin'").get() as {n:number}).n).toBe(1);
 });
 it('đăng nhập, đăng xuất, hết hạn và giới hạn lần thử sai',async()=>{
  await call('/api/demo/auth/register','POST',{email:'member@example.test',password});
  expect((await call('/api/demo/auth/login','POST',{email:'member@example.test',password,adminOnly:true})).status).toBe(403);
  const signed=await call('/api/demo/auth/login','POST',{email:'member@example.test',password});expect(signed.status).toBe(200);const c=pair(signed);
  expect(((await (await call('/api/demo/auth/session','GET',undefined,{cookie:c})).json()) as {user:{role:string}}).user.role).toBe('user');
  const out=await call('/api/demo/auth/logout','POST',undefined,{cookie:c});expect(out.status).toBe(200);expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(((await (await call('/api/demo/auth/session','GET',undefined,{cookie:c})).json()) as {user:unknown}).user).toBeNull();
  const expiring=await call('/api/demo/auth/login','POST',{email:'member@example.test',password});const expiredCookie=pair(expiring);sqlite.prepare('UPDATE preview_sessions SET expires_at=0').run();expect(((await (await call('/api/demo/auth/session','GET',undefined,{cookie:expiredCookie})).json()) as {user:unknown}).user).toBeNull();
  for(let i=0;i<5;i++)expect((await call('/api/demo/auth/login','POST',{email:'member@example.test',password:'wrong-password-example'})).status).toBe(401);
  expect((await call('/api/demo/auth/login','POST',{email:'member@example.test',password})).status).toBe(429);
 },15000);
 it('không nhận role từ đăng ký, method, body hoặc origin không hợp lệ',async()=>{
  expect((await call('/api/demo/auth/register','POST',{email:'x@example.test',password,role:'admin'})).status).toBe(400);
  expect((await call('/api/demo/auth/register','POST',{email:'bad',password})).status).toBe(400);
  expect((await call('/api/demo/auth/register','POST',{email:'x@example.test',password:'short'})).status).toBe(400);
  expect((await call('/api/demo/auth/register','POST',{email:'x@example.test',password},{origin:'https://other.example','sec-fetch-site':'cross-site'})).status).toBe(403);
  expect((await call('/api/demo/auth/register','GET')).status).toBe(405);
  expect((await call('/api/demo/auth/register','POST',{email:'x@example.test',password:'x'.repeat(9000)})).status).toBe(413);
  expect((await call('/api/demo/admin/vod')).status).toBe(401);
  expect((sqlite.prepare('SELECT COUNT(*) AS n FROM preview_accounts').get() as {n:number}).n).toBe(0);
 });
 it('preview HTTPS sau proxy Wrangler dùng cookie Secure và chặn cross-site',async()=>{
  const path='/api/demo/auth/register',payload={email:'proxy@example.test',password};
  function throughProxy(host:string,site:string){return new Request(`http://${host}${path}`,{method:'POST',headers:{origin:`http://${host}`,'sec-fetch-site':site,'x-veo-preview':'local','content-type':'application/json'},body:JSON.stringify(payload)});}
  expect((await worker.fetch(throughProxy('8787-example.e2b.app','cross-site'),env())).status).toBe(403);
  expect((await worker.fetch(throughProxy('example.test','same-origin'),env())).status).toBe(403);
  const response=await worker.fetch(throughProxy('8787-example.e2b.app','same-origin'),env());expect(response.status).toBe(201);expect(response.headers.get('set-cookie')).toContain('; Secure');
 });
 it('version Cloudflare luôn tắt auth, kể cả có env/binding kế thừa',async()=>{
  const hostile={ASSETS:assets,VEO_ENV:'local',ADMIN_PREVIEW:'enabled',VOD_DB:{prepare(){throw new Error('must not touch DB');}}};
  for(const path of ['/api/demo/auth/session','/api/demo/auth/register','/api/demo/auth/admin-setup'])expect((await versionWorker.fetch(req(path,path.endsWith('session')?'GET':'POST',path.endsWith('session')?undefined:{email:'a@example.test',password}),hostile)).status).toBe(503);
 });
});
