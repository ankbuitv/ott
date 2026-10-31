export const shortPath=(id:string)=>`/shorts/${encodeURIComponent(id)}`;
export const moviePath=(id:string)=>`/phim/${encodeURIComponent(id)}`;
export function getShareUrl(path:string,origin:string){const url=new URL(path,origin);if(url.origin!==origin||!url.pathname.startsWith('/shorts/'))throw new Error('Invalid share path');url.search='';url.hash='';return url.toString();}
