import {useState} from 'react';import {Link} from 'react-router-dom';import {ArrowLeft,ShieldCheck} from 'lucide-react';import {AuthForm} from '../components/AuthForm';import {useAuth} from '../lib/auth';
export function AdminAuth(){
 const auth=useAuth(),[showLogin,setShowLogin]=useState(false);
 const setup=auth.status==='ready'&&auth.adminSetupAvailable&&!showLogin;
 return <main className="studio-auth"><div className="studio-auth-wrap"><Link to="/" className="studio-auth-brand"><img src="/brand/veo-mark.png" width="32" height="34" alt=""/><span>VEO <small>STUDIO</small></span></Link>
  <section className="studio-auth-card" aria-labelledby="studio-auth-title"><div className="studio-auth-icon"><ShieldCheck size={22}/></div>
   {auth.status==='loading'?<><h1 id="studio-auth-title">Đang kiểm tra phiên</h1><p role="status">Vui lòng đợi trong giây lát…</p></>:auth.status==='disabled'||auth.status==='error'?<><h1 id="studio-auth-title">Không thể mở Studio</h1><p>{auth.status==='disabled'?'Đăng nhập quản trị chỉ có trong bản xem thử local.':'Không thể kết nối dịch vụ tài khoản của bản thử.'}</p><button className="button button-secondary account-retry" onClick={()=>void auth.refresh()}>Thử lại</button></>:<><p className="studio-auth-eyebrow">BẢN XEM THỬ LOCAL</p><h1 id="studio-auth-title">{setup?'Thiết lập admin đầu tiên':'Đăng nhập quản trị'}</h1><p>{setup?'Tạo admin mới hoặc dùng email và mật khẩu của tài khoản thử đã đăng ký.':'Sử dụng tài khoản đã được cấp quyền admin của bản xem thử.'}</p>
    {setup&&<div className="studio-auth-warning"><strong>Thiết lập một lần.</strong> Trước khi bạn hoàn tất, bất kỳ ai có link preview đều có thể tạo admin trước bạn. Hãy thiết lập ngay và dùng mật khẩu riêng cho bản thử.</div>}
    {!setup&&auth.user?.role==='user'&&<div className="studio-auth-warning">Tài khoản hiện tại không có quyền quản trị. Hãy đăng nhập bằng tài khoản admin.</div>}
    <AuthForm key={setup?'setup':'login'} idPrefix="admin" kind={setup?'setup':'login'} submit={setup?auth.setupAdmin:(email,password)=>auth.login(email,password,true)}/>
    {auth.adminSetupAvailable&&<button className="studio-auth-switch" onClick={()=>setShowLogin(value=>!value)}>{setup?'Đã có tài khoản? Đăng nhập':'Quay lại thiết lập admin'}</button>}
    <p className="studio-auth-note">Không gửi email; địa chỉ chưa được xác minh. Dữ liệu chỉ lưu trong workspace local và có thể bị mất.</p>
   </>}
  </section><Link to="/" className="studio-auth-back"><ArrowLeft size={15}/> Về trang VEO</Link></div></main>;
}
