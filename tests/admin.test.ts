import {describe,it,expect} from 'vitest';
import worker from '../worker/index';
import {initialChannels,loadChannels,nextNumber,normalizeNumber,saveChannels,STUDIO_STORAGE_KEY,validateChannel,type ChannelDraft} from '../src/admin/data';
const assets={fetch:async(req:Request)=>new URL(req.url).pathname==='/index.html'?new Response('<html>VEO</html>',{headers:{'content-type':'text/html'}}):new Response('not found',{status:404})};
const request=(p:string)=>new Request(`https://veo.example${p}`,{headers:{accept:'text/html'}});
describe('Admin preview không phải production',()=>{
 it('đóng route theo mặc định kể cả VEO_ENV local',async()=>{expect((await worker.fetch(request('/admin'),{ASSETS:assets,VEO_ENV:'local'})).status).toBe(404);});
 it('chỉ mở cờ preview và local cho trang được phép',async()=>{const env={ASSETS:assets,VEO_ENV:'local',ADMIN_PREVIEW:'enabled'};expect((await worker.fetch(request('/admin'),env)).status).toBe(200);expect((await worker.fetch(request('/admin/kenh'),env)).status).toBe(200);expect((await worker.fetch(request('/admin/khong-co'),env)).status).toBe(404);});
 it('đóng ở môi trường khác ngay cả khi bật cờ preview',async()=>{expect((await worker.fetch(request('/admin/kenh'),{ASSETS:assets,VEO_ENV:'production',ADMIN_PREVIEW:'enabled'})).status).toBe(404);});
});
describe('Dữ liệu kênh chỉ trong phiên thử',()=>{
 const draft:ChannelDraft={number:'11',name:'Kênh thử',category:'Tổng hợp',now:'Chương trình mẫu',next:'Tiếp theo',status:'draft'};
 it('khởi tạo danh sách độc lập, chọn số chưa dùng',()=>{const a=initialChannels(),b=initialChannels();a[0].name='Khác';expect(b[0].name).toBe('Kênh mẫu 01');expect(nextNumber(b)).toBe('11');expect(normalizeNumber('1')).toBe('01');});
 it('kiểm tra trùng số và trường nhập',()=>{const items=initialChannels();expect(validateChannel({...draft,number:'1'},items)).toMatch(/đã có/);expect(validateChannel({...draft,number:'1'},items,items[0].id)).toBeNull();expect(validateChannel({...draft,number:'a'},items)).not.toBeNull();expect(validateChannel({...draft,name:' '},items)).not.toBeNull();expect(validateChannel(draft,items)).toBeNull();});
 it('lưu và đọc lại kể cả danh sách rỗng',()=>{const map=new Map<string,string>();const store={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};expect(saveChannels(store,[])).toBe(true);expect(loadChannels(store)).toEqual([]);expect(map.has(STUDIO_STORAGE_KEY)).toBe(true);});
 it('dữ liệu session hỏng hoặc ảnh lạ không được sử dụng',()=>{const items=initialChannels();const store={getItem:()=>JSON.stringify([{...items[0],image:'https://external.invalid/a'}])};expect(loadChannels(store)).toEqual(initialChannels());expect(loadChannels({getItem:()=>'{'})).toEqual(initialChannels());});
 it('storage không khả dụng không làm văng ứng dụng',()=>{expect(saveChannels({setItem:()=>{throw new Error('blocked');}},initialChannels())).toBe(false);expect(loadChannels({getItem:()=>{throw new Error('blocked');}})).toEqual(initialChannels());});
});
