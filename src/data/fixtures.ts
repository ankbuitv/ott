/** Dữ liệu hoàn toàn minh họa, không đại diện kênh/chương trình có bản quyền. */
export interface Movie { id:string; title:string; category:string; description:string; image:string; duration:string }
export interface Channel { id:string; number:string; name:string; category:string; now:string; next:string; image:string; tone:string }
export interface Short { id:string; title:string; description:string; image:string; video:string }
export const movies:Movie[] = [
 {id:'mien-song-lang',title:'Miền sóng lặng',category:'Khám phá',duration:'Phim ngắn',image:'/images/film-coast.jpg',description:'Một hành trình tưởng tượng qua những miền biển và những câu chuyện chưa kể.'},
 {id:'sau-con-mua',title:'Sau cơn mưa',category:'Đời sống',duration:'Phim ngắn',image:'/images/film-city.jpg',description:'Khi thành phố lên đèn, những khoảnh khắc bình dị bỗng trở nên đáng nhớ.'},
 {id:'giua-tang-may',title:'Giữa tầng mây',category:'Khám phá',duration:'Phim ngắn',image:'/images/film-mountain.jpg',description:'Chạm đến khoảng lặng giữa núi đồi trong một chuyến đi hư cấu.'},
 {id:'nhip-dap-san-co',title:'Nhịp đập sân cỏ',category:'Thể thao',duration:'Phim ngắn',image:'/images/film-stadium.jpg',description:'Những cảm xúc rất riêng được lấy cảm hứng từ tình yêu thể thao.'},
 {id:'mot-chut-binh-yen',title:'Một chút bình yên',category:'Đời sống',duration:'Phim ngắn',image:'/images/film-coast.jpg',description:'Một câu chuyện minh họa về những ngày chậm lại để tận hưởng hiện tại.'},
];
export const channels:Channel[] = [
 {id:'kenh-mau-01',number:'01',name:'Kênh mẫu 01',category:'Khám phá',now:'Việt Nam qua khung cửa',next:'Những miền ký ức',image:'/images/hero-ha-long.jpg',tone:'mint'},
 {id:'kenh-mau-02',number:'02',name:'Kênh mẫu 02',category:'Giải trí',now:'Chuyện kể mỗi ngày',next:'Góc thư giãn',image:'/images/film-city.jpg',tone:'coral'},
 {id:'kenh-mau-03',number:'03',name:'Kênh mẫu 03',category:'Thể thao',now:'Nhịp đập sân cỏ',next:'Khoảnh khắc thể thao',image:'/images/film-stadium.jpg',tone:'sky'},
 {id:'kenh-mau-04',number:'04',name:'Kênh mẫu 04',category:'Phim',now:'Miền sóng lặng',next:'Một chút bình yên',image:'/images/film-coast.jpg',tone:'violet'},
 {id:'kenh-mau-05',number:'05',name:'Kênh mẫu 05',category:'Tổng hợp',now:'Ngày mới nhiều cảm hứng',next:'Góc nhìn hôm nay',image:'/images/hero-ha-long.jpg',tone:'gold'},
 {id:'kenh-mau-06',number:'06',name:'Kênh mẫu 06',category:'Đời sống',now:'Những điều giản dị',next:'Chuyện bên hiên nhà',image:'/images/film-city.jpg',tone:'rose'},
 {id:'kenh-mau-07',number:'07',name:'Kênh mẫu 07',category:'Thiếu nhi',now:'Thế giới sắc màu',next:'Cùng nhau khám phá',image:'/images/film-mountain.jpg',tone:'teal'},
 {id:'kenh-mau-08',number:'08',name:'Kênh mẫu 08',category:'Âm nhạc',now:'Giai điệu dịu dàng',next:'Thanh âm thành phố',image:'/images/film-city.jpg',tone:'slate'},
 {id:'kenh-mau-09',number:'09',name:'Kênh mẫu 09',category:'Khám phá',now:'Chạm vào thiên nhiên',next:'Dọc những cung đường',image:'/images/film-mountain.jpg',tone:'mint'},
 {id:'kenh-mau-10',number:'10',name:'Kênh mẫu 10',category:'Giải trí',now:'Phút giây thư giãn',next:'Chuyện cuối tuần',image:'/images/film-coast.jpg',tone:'coral'},
];
export const shorts:Short[] = [
 {id:'mot-chut-binh-yen',title:'Một chút bình yên',description:'Dành một khoảng lặng cho riêng mình.',image:'/images/film-mountain.jpg',video:'/demo/short-mountain.mp4'},
 {id:'thanh-pho-len-den',title:'Khi thành phố lên đèn',description:'Một góc nhỏ của thành phố trong trí tưởng tượng.',image:'/images/film-city.jpg',video:'/demo/short-city.mp4'},
 {id:'ngay-o-ben-bien',title:'Ngày ở bên biển',description:'Những thước hình cho một ngày thong thả.',image:'/images/film-coast.jpg',video:'/demo/short-coast.mp4'},
];
export const categories=['Tất cả','Khám phá','Đời sống','Thể thao'];
