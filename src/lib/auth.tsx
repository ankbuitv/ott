import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
export type AuthUser={id:string;email:string;role:'user'|'admin';emailVerified:false};
type AuthState={status:'loading'|'ready'|'disabled'|'error';user:AuthUser|null;adminSetupAvailable:boolean};
type AuthContextValue=AuthState&{
 refresh:()=>Promise<void>;
 login:(email:string,password:string,adminOnly?:boolean)=>Promise<void>;
 register:(email:string,password:string)=>Promise<void>;
 setupAdmin:(email:string,password:string)=>Promise<void>;
 logout:()=>Promise<void>;
};
const Context=createContext<AuthContextValue|null>(null);
const initial:AuthState={status:'loading',user:null,adminSetupAvailable:false};
function parse(value:unknown):Pick<AuthState,'user'|'adminSetupAvailable'>{
 if(!value||typeof value!=='object')throw new Error('Dữ liệu tài khoản không hợp lệ.');
 const {user,adminSetupAvailable}=value as {user:unknown;adminSetupAvailable:unknown};
 if(typeof adminSetupAvailable!=='boolean')throw new Error('Dữ liệu tài khoản không hợp lệ.');
 if(user!==null){if(!user||typeof user!=='object')throw new Error('Dữ liệu tài khoản không hợp lệ.');const u=user as Record<string,unknown>;if(typeof u.id!=='string'||typeof u.email!=='string'||!['admin','user'].includes(String(u.role))||u.emailVerified!==false)throw new Error('Dữ liệu tài khoản không hợp lệ.');}
 return {user:user as AuthUser|null,adminSetupAvailable};
}
async function read(response:Response){const body:unknown=await response.json().catch(()=>null);if(!response.ok){const error=body&&typeof body==='object'?(body as {error?:{code?:string;message?:string}}).error:undefined;throw Object.assign(new Error(error?.message||'Không thể kết nối tài khoản bản thử.'),{code:error?.code});}return body;}
export function AuthProvider({children}:{children:ReactNode}){
 const [state,setState]=useState<AuthState>(initial);const generation=useRef(0);
 async function refresh(){const id=++generation.current;try{const response=await fetch('/api/demo/auth/session',{cache:'no-store',signal:AbortSignal.timeout(10000)});const data=parse(await read(response));if(id===generation.current)setState({status:'ready',...data});}catch(error){if(id===generation.current)setState({status:error&&typeof error==='object'&&'code'in error&&error.code==='AUTH_DISABLED'?'disabled':'error',user:null,adminSetupAvailable:false});}}
 useEffect(()=>{void refresh();},[]);
 async function action(path:string,payload?:unknown){const response=await fetch(`/api/demo/auth/${path}`,{method:'POST',headers:{'X-VEO-Preview':'local',...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)}),cache:'no-store',signal:AbortSignal.timeout(15000)});return read(response);}
 async function authenticate(path:string,email:string,password:string,adminOnly?:boolean){const id=++generation.current;const data=parse(await action(path,{email,password,...(adminOnly?{adminOnly:true}:{})}));if(id===generation.current)setState({status:'ready',...data});}
 const value=useMemo<AuthContextValue>(()=>({...state,refresh,login:(email,password,adminOnly)=>authenticate('login',email,password,adminOnly),register:(email,password)=>authenticate('register',email,password),setupAdmin:(email,password)=>authenticate('admin-setup',email,password),logout:async()=>{await action('logout');await refresh();}}),[state]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(){const context=useContext(Context);if(!context)throw new Error('Missing AuthProvider');return context;}
