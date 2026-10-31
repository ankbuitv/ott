import {useState,type FormEvent} from 'react';import {ArrowRight,LockKeyhole,Mail} from 'lucide-react';
type Props={idPrefix:string;kind:'login'|'register'|'setup';submit:(email:string,password:string)=>Promise<void>};
export function AuthForm({idPrefix,kind,submit}:Props){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[message,setMessage]=useState(''),[invalid,setInvalid]=useState(''),[pending,setPending]=useState(false);
 const creating=kind!=='login';
 async function onSubmit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,emailField=form.elements.namedItem('email') as HTMLInputElement|null,passwordField=form.elements.namedItem('password') as HTMLInputElement|null,confirmField=form.elements.namedItem('confirm') as HTMLInputElement|null;
  if(!emailField?.validity.valid){setInvalid('email');setMessage('Vui lòng nhập địa chỉ email hợp lệ.');emailField?.focus();return;}
  if(password.length<12||password.length>128||new TextEncoder().encode(password).length>256){setInvalid('password');setMessage('Mật khẩu cần từ 12 đến 128 ký tự.');passwordField?.focus();return;}
  if(creating&&password!==confirm){setInvalid('confirm');setMessage('Mật khẩu nhập lại chưa khớp.');confirmField?.focus();return;}
  setPending(true);setInvalid('');setMessage('');
  try{await submit(email,password);setPassword('');setConfirm('');}catch(error){setMessage(error instanceof Error?error.message:'Không thể hoàn tất. Vui lòng thử lại.');}finally{setPending(false);}
 }
 const label=kind==='login'?'Đăng nhập':kind==='register'?'Tạo tài khoản':'Thiết lập admin';
 return <form className="auth-form" onSubmit={onSubmit} noValidate>
  <div className="auth-form-row"><label htmlFor={`${idPrefix}-email`}>Địa chỉ email</label><div className={`email-field${invalid==='email'?' is-invalid':''}`}><Mail size={18} aria-hidden="true"/><input id={`${idPrefix}-email`} name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>{setEmail(e.target.value);setInvalid('');setMessage('');}} placeholder="ban@example.com" aria-invalid={invalid==='email'} aria-describedby={`${idPrefix}-message`}/></div></div>
  <div className="auth-form-row"><label htmlFor={`${idPrefix}-password`}>Mật khẩu</label><div className={`email-field${invalid==='password'?' is-invalid':''}`}><LockKeyhole size={18} aria-hidden="true"/><input id={`${idPrefix}-password`} name="password" type="password" autoComplete={creating?'new-password':'current-password'} minLength={12} maxLength={128} required value={password} onChange={e=>{setPassword(e.target.value);setInvalid('');setMessage('');}} placeholder="Ít nhất 12 ký tự" aria-invalid={invalid==='password'} aria-describedby={`${idPrefix}-help ${idPrefix}-message`}/></div><small id={`${idPrefix}-help`}>Chỉ dùng mật khẩu riêng cho bản thử; không có khôi phục mật khẩu.</small></div>
  {creating&&<div className="auth-form-row"><label htmlFor={`${idPrefix}-confirm`}>Nhập lại mật khẩu</label><div className={`email-field${invalid==='confirm'?' is-invalid':''}`}><LockKeyhole size={18} aria-hidden="true"/><input id={`${idPrefix}-confirm`} name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={e=>{setConfirm(e.target.value);setInvalid('');setMessage('');}} placeholder="Nhập lại mật khẩu" aria-invalid={invalid==='confirm'} aria-describedby={`${idPrefix}-message`}/></div></div>}
  <button className="button button-primary account-submit" type="submit" disabled={pending}>{pending?'Đang xử lý…':label} <ArrowRight size={17} aria-hidden="true"/></button>
  <p id={`${idPrefix}-message`} className={`form-message${message?' is-error':''}`} role="status" aria-live="polite">{message}</p>
 </form>;
}
