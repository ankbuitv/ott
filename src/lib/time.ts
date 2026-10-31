export function parseXmltvTime(value:string):Date|null {
 const m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s+([+-])(\d{2})(\d{2})$/.exec(value.trim()); if(!m) return null;
 const [,y,mo,d,h,mi,s,sign,oh,om]=m; const [year,month,day,hour,minute,second,offHour,offMin]=[y,mo,d,h,mi,s,oh,om].map(Number);
 if(month<1||month>12||day<1||hour>23||minute>59||second>59||offHour>14||offMin>59||(offHour===14&&offMin!==0))return null;
 const local=Date.UTC(year,month-1,day,hour,minute,second); const check=new Date(local); if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
 return new Date(local-(offHour*60+offMin)*(sign==='+'?1:-1)*60_000);
}
export const vnTime=(date:Date)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
export const vnDate=(date:Date)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'numeric',month:'long'}).format(date);
