import {useEffect,useState,type FormEvent} from 'react';
import {ClerkProvider,useAuth,useClerk,useUser} from '@clerk/react';
import {ArrowRight,ShieldCheck,Sprout,Tractor,ShoppingBasket} from 'lucide-react';
import {App} from './App';
import {api,readLocal,writeLocal,setTokenGetter,send,type Config,type User} from './api';

export type AuthBridge={ready:boolean;signedIn:boolean;sessionId:string|null|undefined;name:string;signIn:()=>void;signUp:()=>void;signOut:()=>Promise<void>;manage:()=>void};
function ClerkApp(){
 const {isLoaded,isSignedIn,sessionId,getToken}=useAuth();const clerk=useClerk();const {user}=useUser();
 // Set before children's effects issue API requests. Tokens stay in memory only.
 setTokenGetter(()=>getToken());
 return <App identity={{ready:isLoaded,signedIn:!!isSignedIn,sessionId,name:user?.fullName||'',signIn:()=>clerk.openSignIn(),signUp:()=>clerk.openSignUp(),signOut:async()=>{await clerk.signOut();},manage:()=>clerk.openUserProfile()}}/>;
}
export function AuthRoot(){
 const [config,setConfig]=useState<Config|null>(null),[error,setError]=useState('');
 useEffect(()=>{api<Config>('/config').then(c=>{writeLocal('wirefen-config',c);setConfig(c);}).catch(()=>{const saved=readLocal<Config|null>('wirefen-config',null);if(saved&&!navigator.onLine)setConfig(saved);else setError('We could not connect to Wirefen. Check your connection and try again.');});},[]);
 if(error)return <div className="startup-state"><Sprout size={36}/><h1>Let’s reconnect.</h1><p role="alert">{error}</p><button className="primary" onClick={()=>location.reload()}>Try again</button></div>;
 if(!config)return <div className="startup-state" role="status"><Sprout size={36}/><p>Opening your growing network…</p></div>;
 if(config.auth_provider==='clerk'&&config.clerk_publishable_key&&navigator.onLine)return <ClerkProvider publishableKey={config.clerk_publishable_key} localization={{signIn:{start:{title:'Sign in to Wirefen'}},signUp:{start:{title:'Create your Wirefen account'}}}} appearance={{variables:{colorPrimary:'#234c36',colorForeground:'#203a2b',fontFamily:'DM Sans, sans-serif',borderRadius:'0.8rem'},elements:{cardBox:{boxShadow:'0 24px 80px #173c2826'},formButtonPrimary:{minHeight:'44px'}}}}><ClerkApp/></ClerkProvider>;
 return <App offlineClerk={config.auth_provider==='clerk'}/>;
}
export function Onboarding({name,onComplete}:{name:string;onComplete:(user:User)=>void}){
 const [form,setForm]=useState({name,phone:'',role:'Buyer',farm_name:'',location:'',sms_opt_in:false}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{onComplete(await send<User>('/auth/onboard',form));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="onboarding-page"><div className="page-heading"><div><span className="eyebrow">One last step</span><h1>Find your place in the harvest.</h1><p>Your sign-in is ready. Tell us how you’ll use Wirefen.</p></div></div><form className="onboarding-form" onSubmit={submit}><fieldset className="role-options"><legend>I’m here to</legend>{[{role:'Buyer',label:'Source fresh produce',icon:ShoppingBasket},{role:'Farmer',label:'Sell my harvest',icon:Tractor}].map(x=><label key={x.role} className={form.role===x.role?'selected':''}><input type="radio" name="role" value={x.role} checked={form.role===x.role} onChange={()=>setForm({...form,role:x.role})}/><x.icon size={23}/><span><strong>{x.role}</strong><small>{x.label}</small></span></label>)}</fieldset><label className="field"><span>Full name</span><input required autoComplete="name" minLength={2} maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="field"><span>Contact phone number</span><input required type="tel" autoComplete="tel" placeholder="+27821234567" pattern="\+[1-9][0-9]{7,14}" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><small>Include your country code. This is your unique Wirefen contact number.</small></label>{form.role==='Farmer'&&<div className="form-grid"><label className="field"><span>Farm name</span><input required minLength={2} maxLength={100} value={form.farm_name} onChange={e=>setForm({...form,farm_name:e.target.value})}/></label><label className="field"><span>Farm location</span><input required minLength={2} maxLength={100} placeholder="Town or region" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label></div>}<label className="checkbox-label"><input type="checkbox" checked={form.sms_opt_in} onChange={e=>setForm({...form,sms_opt_in:e.target.checked})}/>Send me Wirefen SMS updates. I can opt out in Settings or reply STOP.</label>{error&&<div className="error-box" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy?'Creating your profile…':'Complete my account'}<ArrowRight size={17}/></button><p className="auth-reassurance"><ShieldCheck size={16}/>Your sign-in is secured by Clerk.</p></form></section>;
}
