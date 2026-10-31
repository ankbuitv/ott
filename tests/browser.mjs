if(process.env.VEO_TEST_ISOLATED!=='1')throw new Error('Browser tests cần bản preview D1 tách biệt; chạy qua npm script.');
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {brotliDecompressSync} from 'node:zlib';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const base=process.env.VEO_TEST_URL??'http://127.0.0.1:8787';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname)) throw new Error('Browser test chỉ chấp nhận máy local.');
const temp=resolve('.cache/tmp');mkdirSync(temp,{recursive:true});process.env.TMPDIR=temp;
const libs=resolve('.cache/chromium-libs');
if(!existsSync(`${libs}/lib/libnspr4.so`)){
 mkdirSync(libs,{recursive:true});const tar=`${libs}/al2023.tar`;
 writeFileSync(tar,brotliDecompressSync(readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
 execFileSync('tar',['-xf',tar,'-C',libs]);
}
mkdirSync('.cache/browser',{recursive:true});
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true,env:{...process.env,LD_LIBRARY_PATH:`${libs}/lib${process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:''}`}});
const page=await browser.newPage(),errors=[],external=[],authRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{const url=r.url();if(/^https?:/.test(url)){const parsed=new URL(url);if(parsed.origin!==new URL(base).origin)external.push(parsed.origin);if(parsed.pathname.startsWith('/api/auth/'))authRequests.push(parsed.pathname);}});
const open=path=>page.goto(`${base}${path}`,{waitUntil:'networkidle0',timeout:30000});
const text=(selector,value)=>page.waitForFunction((s,v)=>document.querySelector(s)?.textContent?.includes(v),{},selector,value);
const waitVideo=()=>page.waitForFunction(()=>{const v=document.querySelector('video');return v&&Number.isFinite(v.duration)&&v.duration>0&&!document.querySelector('.player-error')&&!document.querySelector('.player-loading');},{timeout:15000});
try{
 await page.setViewport({width:1440,height:900});
 await open('/');await text('h1','Khám phá');
 assert.ok(await page.$eval('.sidebar',e=>e.getBoundingClientRect().width<80),'Sidebar mặc định chỉ biểu tượng');
 assert.equal(await page.$eval('button[aria-label="Mở rộng thanh điều hướng"]',e=>e.getAttribute('aria-expanded')),'false');
 await page.click('button[aria-label="Mở rộng thanh điều hướng"]');
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width>225);
 assert.equal(await page.$eval('button[aria-label="Thu gọn thanh điều hướng"]',e=>e.getAttribute('aria-expanded')),'true');
 await page.click('button[aria-label="Thu gọn thanh điều hướng"]');
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width<80);
 await page.screenshot({path:'.cache/browser/desktop.png',fullPage:true});
 await page.click('.poster-favorite');await page.click('.sidebar .nav-link[href="/yeu-thich"]');
 await text('h1','Yêu thích');assert.equal(await page.$$eval('.movie-card',x=>x.length),1);

 await open('/lich-phat-song');await page.click('.guide-table td button');
 assert.equal(await page.$eval('.content-dialog',d=>d.open),true);await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('.content-dialog').open);
 await open('/phim/mien-song-lang');await text('h1','Miền sóng lặng');
 await open('/shorts/thanh-pho-len-den');await text('.short-copy h2','thành phố');
 await page.click('button[aria-label="Video tiếp theo"]');await page.waitForFunction(()=>location.pathname==='/shorts/ngay-o-ben-bien');
 const missing=await open('/phim/khong-ton-tai');await text('h1','Không tìm thấy');assert.equal(missing.status(),404);

 await open('/truyen-hinh');await waitVideo();
 assert.equal(await page.$$('.ribbon-station').then(x=>x.length),10);
 assert.equal(await page.$$('.station-card').then(x=>x.length),10);
 await page.type('.channel-search input','the thao');
 assert.equal(await page.$$('.station-card').then(x=>x.length),1);
 // Clear using real input events so React's controlled state updates.
 await page.$eval('.channel-search input',e=>e.select());await page.keyboard.press('Backspace');
 await page.waitForFunction(()=>document.querySelectorAll('.station-card').length===10);
 await page.type('.channel-search input','khong co kenh');await text('.channel-empty','Không tìm thấy');
 await page.$eval('.channel-search input',e=>e.select());await page.keyboard.press('Backspace');
 await page.waitForFunction(()=>document.querySelectorAll('.station-card').length===10);
 const filmFilter=await page.$$(' .channel-filters button');
 for(const el of filmFilter){if(await el.evaluate(e=>e.textContent)==='Phim'){await el.click();break;}}
 assert.equal(await page.$$('.station-card').then(x=>x.length),1);
 await page.click('.station-card');await text('.now-info h2','Miền sóng lặng');
 assert.ok(page.url().includes('kenh=kenh-mau-04'));
 await page.click('.channel-panel-tabs button:nth-child(2)');
 await text('.schedule-preview','Miền sóng lặng');await text('.schedule-preview','Một chút bình yên');
 await page.click('.channel-panel-tabs button:nth-child(1)');
 await page.click('.ribbon-station[data-channel="kenh-mau-03"]');await text('.now-info h2','Nhịp đập sân cỏ');
 await page.goBack();await text('.now-info h2','Miền sóng lặng');
 await page.goForward();await text('.now-info h2','Nhịp đập sân cỏ');
 await page.$eval('video',async v=>{v.muted=true;await v.play();});
 await page.waitForFunction(()=>document.querySelector('video').currentTime>.2,{timeout:10000});
 await page.$eval('video',v=>v.pause());await page.select('.player-options select','dash');await waitVideo();
 await page.select('.player-options select','mp4');await waitVideo();
 assert.equal(await page.$eval('video',v=>v.getAttribute('src')),'/demo/sample.mp4');
 await page.screenshot({path:'.cache/browser/tv-desktop.png',fullPage:true});

 await open('/tai-khoan');
 assert.equal(await page.$eval('#account-email',e=>e.type),'email');
 assert.equal(await page.$('input[type="tel"]'),null);
 await page.click('.account-submit');await text('#account-message','hợp lệ');
 assert.equal(await page.$eval('#account-email',e=>e.getAttribute('aria-invalid')),'true');
 await page.type('#account-email','khongphaiemail');await page.click('.account-submit');await text('#account-message','hợp lệ');
 await page.click('.auth-tabs button:nth-child(2)');await text('.account-form-panel','Đăng ký');
 const syntheticPassword=`browser-${globalThis.crypto.randomUUID()}`;
 await page.type('#account-email','viewer@example.test');await page.type('#account-password',syntheticPassword);await page.type('#account-confirm',syntheticPassword);
 await page.click('.account-submit');await text('.account-form-panel','Đã đăng nhập');await text('.account-status','Email chưa xác minh');
 assert.deepEqual(authRequests,[]);await page.screenshot({path:'.cache/browser/email.png',fullPage:true});
 await page.click('.account-retry');await text('.account-form-panel','Chào mừng');
 await page.type('#account-email','viewer@example.test');await page.type('#account-password',syntheticPassword);await page.click('.account-submit');await text('.account-form-panel','Đã đăng nhập');

 for(const width of [320,375,390,768,1024,1440]){
  await page.setViewport({width,height:844});
  for(const path of ['/','/truyen-hinh']){await open(path);const dimensions=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(dimensions[0]<=dimensions[1]+1,`overflow ${path} ${width}: ${dimensions}`);}
 }
 await page.setViewport({width:768,height:844});await open('/');
 await page.click('button[aria-label="Mở rộng thanh điều hướng"]');
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width>225);
 assert.equal(await page.$eval('.main-column',e=>getComputedStyle(e).marginLeft),'76px');
 await page.click('button[aria-label="Thu gọn thanh điều hướng"]');
 await page.setViewport({width:390,height:844});await open('/truyen-hinh');
 await page.screenshot({path:'.cache/browser/tv-mobile.png',fullPage:true});
 await page.click('button[aria-label="Mở điều hướng"]');assert.equal(await page.$eval('.mobile-dialog',d=>d.open),true);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.mobile-dialog').open);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await page.close();

 const audit=await browser.newPage();await audit.setBypassCSP(true);const issues=[];
 for(const [path,width,schedule] of [['/',1440,false],['/',390,false],['/truyen-hinh',1440,false],['/truyen-hinh',390,false],['/truyen-hinh',1440,true],['/tai-khoan',390,false]]){
  await audit.setViewport({width,height:900});await audit.goto(`${base}${path}`,{waitUntil:'networkidle0'});
  if(schedule)await audit.click('.channel-panel-tabs button:nth-child(2)');
  await audit.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  const result=await audit.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  for(const v of result.violations)issues.push({path,width,id:v.id,impact:v.impact});
 }
 await audit.close();console.log('Axe (mẫu trang/viewport):',JSON.stringify(issues));
 assert.deepEqual(issues.filter(i=>['critical','serious'].includes(i.impact)),[]);
 console.log('Browser: sidebar, email, channel picker/schedule, player, mobile, routing: PASS');
}finally{await browser.close();}
