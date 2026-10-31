/** Danh mục chỉ đọc đóng gói cùng bản Worker version; không chứa dữ liệu thật. */
import {movies} from './fixtures';
import type {Vod,VodSource} from './vod';
const sources:VodSource[]=['hls','mp4','dash','hls'];
export const versionVod:Vod[]=movies.slice(0,4).map((movie,index)=>({
 id:`demo-${movie.id}`,title:movie.title,description:movie.description,category:movie.category,image:movie.image,
 source:sources[index],status:'published' as const,createdAt:index+1,updatedAt:index+1,
})).reverse();
