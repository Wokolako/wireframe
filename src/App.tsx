import {usePathname} from 'next/navigation';
import {navigate as go} from './navigation';
import Link from 'next/link';
import {ProducePriceReferences} from './ProducePriceReferences';
import {CountrySelect,LocationSettings,FinancialAnalytics,VerificationAssignments,AgentWorkspace} from './Compliance';
import {StorefrontMarketplace as Marketplace,StorefrontDetail as ProduceDetail,StorefrontBasket,AdminListingReport,AdminGuestOrders,BulkRequests} from './Storefront';
import {hasGeography} from '../shared/geography.mjs';
import {guestLimitFor} from '../shared/guest-limits.mjs';
import {costTotal,costFields} from '../shared/finance.mjs';
import {readPrivate,writePrivate,clearPrivate} from './private-drafts';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowDownUp,ArrowLeft,ArrowRight,ArrowUpRight,Bookmark,Check,CheckCheck,ChevronDown,ChevronRight,CircleHelp,ClipboardList,Clock,Flower2,LayoutGrid,Leaf,LogOut,MapPin,Menu,Package,Plus,Search,Settings,ShieldCheck,SlidersHorizontal,Sprout,Tractor,Users,WifiOff,X,Wheat,Apple,Carrot,Bean,CheckCircle2,Phone,Download,RefreshCw,CreditCard,Smartphone,Receipt,Building2,Send} from 'lucide-react';
import {Onboarding,type AuthBridge} from './auth';
import {GetApp,InstallInvitation,useInstall} from './pwa';
import {CurrencyConverter,CurrencySelect,CurrencyNotice,useCurrency} from './currency';
import {ArrowRightLeft} from 'lucide-react';
import {PRESENTATION_MODE,api,send,number,date,readLocal,writeLocal,type User,type Listing,type Order,type Farmer,type Config,type Payment,type UssdSimulateResult} from './api';

const categories=[{name:'All produce',icon:LayoutGrid},{name:'Vegetables',icon:Carrot},{name:'Fruits',icon:Apple},{name:'Grains',icon:Wheat},{name:'Tubers',icon:Sprout},{name:'Legumes',icon:Bean}];
function useRoute(){const path=usePathname()||'/';return path==='/'?'/marketplace':path;}
function IconLabel({children}:{children:ReactNode}){return <span className="icon-label">{children}</span>;}
function ErrorBox({error}:{error:string}){return error?<div className="error-box" role="alert">{error}</div>:null;}
function Empty({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){return <div className="empty"><Sprout size={36} aria-hidden="true"/><h2>{title}</h2><p>{children}</p>{action}</div>;}
function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}

export function App({identity,offlineClerk=false}:{identity?:AuthBridge;offlineClerk?:boolean}){
 const route=useRoute();const [user,setUser]=useState<User|null>(()=>navigator.onLine?null:readLocal('wirefen-session',null));const [config,setConfig]=useState<Config>({demo:false,market:'',currency:'ZAR',sms_ready:false});const [auth,setAuth]=useState(false);const [ussdOpen,setUssdOpen]=useState(false);const [online,setOnline]=useState(navigator.onLine);const [menu,setMenu]=useState(false);const [notice,setNotice]=useState('');const [sessionReady,setSessionReady]=useState(false);const [saved,setSaved]=useState<string[]>(()=>readLocal('wirefen-saved',[]));const main=useRef<HTMLElement>(null);
 const pwa=useInstall({ready:sessionReady&&(!identity||identity.ready),userId:user?.id,online});
 useEffect(()=>{if(identity&&!identity.ready)return;setSessionReady(false);let alive=true;Promise.all([api<User|null>('/auth/me'),api<Config>('/config')]).then(([u,c])=>{if(!alive)return;setUser(u);setConfig(c);writeLocal('wirefen-session',u);writeLocal('wirefen-config',c);}).catch(()=>{if(!navigator.onLine){setUser(readLocal('wirefen-session',null));setConfig(readLocal('wirefen-config',{demo:false,market:'Offline catalogue',currency:'ZAR',sms_ready:false}));}else setNotice('Could not connect to Wirefen. Check your connection and refresh.');}).finally(()=>{if(alive)setSessionReady(true);});const on=()=>{if(offlineClerk)location.reload();else setOnline(true);},off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{alive=false;window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[identity?.ready,identity?.sessionId]);
 useEffect(()=>{setMenu(false);main.current?.focus({preventScroll:true});},[route]);useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
 useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);}},[notice]);
 const notify=(s:string)=>setNotice(s);
 const signIn=()=>{if(offlineClerk){notify('Connect to the internet to sign in.');return;}if(identity){if(!identity.ready)notify('Secure sign-in is still loading. Please try again shortly.');else identity.signIn();}else setAuth(true);};
 useEffect(()=>{clearPrivate();},[identity?.sessionId]);
 const needsProfile=!!identity?.signedIn&&sessionReady&&!user;
 const toggleSave=(id:string)=>{const next=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id];setSaved(next);writeLocal('wirefen-saved',next);notify(next.includes(id)?'Produce saved to your shortlist.':'Produce removed from your shortlist.');};
 const logout=async()=>{try{clearPrivate();if(identity)await identity.signOut();else await send('/auth/logout',{});setUser(null);writeLocal('wirefen-session',null);go('/marketplace');notify('You have signed out.');}catch(e){notify((e as Error).message);}};
 const fx=useCurrency(config.currency,online);const money=fx.money;
 const nav=[{path:'/marketplace',label:'Marketplace',icon:LayoutGrid},{path:'/saved',label:'Saved produce',icon:Bookmark,count:saved.length},{path:'/requests',label:'Order requests',icon:ClipboardList},{path:'/converter',label:'Currency converter',icon:ArrowRightLeft},...(user?.role==='Farmer'?[{path:'/farm',label:'My farm',icon:Tractor},{path:'/baseline',label:'Growing history',icon:Sprout}]:[]),...(user?.role==='Agent'?[{path:'/verifications',label:'Verifications',icon:ShieldCheck}]:[]),...(user?.role==='Admin'?[{path:'/admin',label:'Admin workspace',icon:Users}]:[])];
 const current=nav.find(n=>route.startsWith(n.path))?.label||(route==='/basket'?'Basket':route.startsWith('/produce')?'Produce details':route.startsWith('/baseline')?'Growing history':route.startsWith('/new-listing')?'Create listing':route==='/verifications'?'Physical verifications':route==='/get-app'?'Get the app':route==='/settings'?'Account settings':route==='/help'?'Help & support':'Wirefen');
 const gate=(roles:string[],content:ReactNode)=>!sessionReady?<div className="loading">Loading your workspaceÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</div>:!user?<Empty title="A little closer to your next harvest" action={<button className="primary" onClick={signIn}>Sign in to continue <ArrowRight size={17}/></button>}>Sign in to access your farm, manage requests, and keep everything in one place.</Empty>:!roles.includes(user.role)?<Empty title="A workspace for every role" action={<Link className="button secondary" href="/marketplace">Back to marketplace</Link>}>This page is for {roles.join(' or ').toLowerCase()} accounts. You are signed in as a {user.role.toLowerCase()}.</Empty>:content;
  return <><Link className="skip-link" href="#main" onClick={e=>{e.preventDefault();main.current?.focus({preventScroll:true});main.current?.scrollIntoView();}}>Skip to content</Link><div className="app-shell"><aside className={'sidebar '+(menu?'is-open':'')}><Link href="/marketplace" className="brand" aria-label="Wirefen home"><span className="brand-mark"><Sprout size={26}/></span>wirefen<span className="brand-dot">.</span></Link><div className="workspace-label">Your growing network</div><nav aria-label="Main navigation">{nav.map(n=><Link key={n.path} href={n.path} className={'nav-item '+(route===n.path?'active':'')} aria-current={route===n.path?'page':undefined}><n.icon size={19}/><span>{n.label}</span>{!!n.count&&<span className="nav-count">{n.count}</span>}</Link>)}</nav><div className="sidebar-bottom"><button className="nav-item" style={{width:'100%',border:0,textAlign:'left',cursor:'pointer',background:'#e4ede0',color:'#214b35',marginBottom:10}} onClick={()=>setUssdOpen(true)}><Smartphone size={18}/><span>Dial *211# (USSD)</span></button><div className="grow-note"><div className="grow-note-top"><Sprout size={24}/><span>Room to grow.</span></div><p>Your next connection starts with a good harvest.</p><Link href={user?.role==='Farmer'?'/new-listing':'/help'}>{user?.role==='Farmer'?'List your produce':'How Wirefen works'}<ArrowUpRight size={16}/></Link></div><Link className={'nav-item '+(route==='/help'?'active':'')} href="/help"><CircleHelp size={19}/>Help & support</Link><div className="sidebar-utilities"><Link className={'nav-item '+(route==='/settings'?'active':'')} href="/settings"><Settings size={19}/>Settings</Link><Link className={'get-app-link '+(route==='/get-app'?'active':'')} href="/get-app"><Download size={17}/>Get app</Link></div><div className="sidebar-footer"><Leaf size={14}/> Growing better, together.</div></div></aside><div className="app-body"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Menu size={22}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{current}</strong></div><div className="topbar-actions"><button className="btn-ussd-dial" onClick={()=>setUssdOpen(true)} title="Simulate feature phone *211# USSD menu"><Smartphone size={15}/>Dial *211#</button><CurrencySelect fx={fx}/>{user?<details className="profile-menu"><summary><span className="avatar">{user.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><span className="profile-name">{user.name}<small>{user.role} account</small></span><ChevronDown size={15}/></summary><div className="profile-dropdown"><Link href="/settings">Account settings</Link>{identity&&<button onClick={identity.manage}><ShieldCheck size={16}/>Sign-in & security</button>}<button onClick={logout}><LogOut size={16}/> Sign out</button></div></details>:<div className="auth-actions">{identity?.signedIn?<><Link className="button secondary compact" href="/onboarding">Finish account</Link><button className="text-button" onClick={logout}>Sign out</button></>:<><button className="secondary compact" disabled={!!identity&&!identity.ready} onClick={signIn}>Sign in <ArrowRight size={16}/></button>{identity&&<button className="primary compact signup-button" disabled={!identity.ready} onClick={()=>identity.ready?identity.signUp():notify('Secure sign-up is still loading. Please try again shortly.')}>Create account</button>}</>}</div>}</div></header>{!online&&<div className="offline-banner" role="status"><WifiOff size={17}/>You're offline. Previously loaded produce is available, and farmer drafts stay on this device.</div>}<main id="main" ref={main} tabIndex={-1}>{['/marketplace','/saved','/farm'].includes(route)||route.startsWith('/produce/')?<CurrencyNotice fx={fx}/>:null}
 {route==='/get-app'?<GetApp pwa={pwa}/>:needsProfile?<Onboarding name={identity?.name||''} onComplete={u=>{setUser(u);writeLocal('wirefen-session',u);go(u.role==='Farmer'?'/farm':'/marketplace');notify('Your Wirefen account is ready.');}}/>:user?.role==='Farmer'&&!hasGeography(user.farmer)?<LocationSettings user={user} update={u=>{setUser(u);writeLocal('wirefen-session',u);}}/>:route==='/converter'?<CurrencyConverter fx={fx}/>:route==='/basket'?<StorefrontBasket user={user} money={money} signIn={signIn} notify={notify}/>: (route==='/marketplace'||route==='/saved')?<Marketplace key={route} savedOnly={route==='/saved'} saved={saved} toggleSave={toggleSave} money={money} user={user} config={config} signIn={signIn}/>:route.startsWith('/produce/')?<ProduceDetail id={route.split('/')[2]} user={user} money={money} saved={saved} toggleSave={toggleSave} signIn={signIn} notify={notify}/>:route==='/requests'?gate(['Buyer','Admin'],<Requests user={user!} notify={notify}/>):route==='/farm'?gate(['Farmer'],<Farm user={user!} money={money}/>):route.startsWith('/baseline')?gate(['Farmer'],<Baseline key={route+user?.id} farmerId={route.split('/')[2]||user?.farmer?.id||''} user={user!} online={online} currency={config.currency} notify={notify}/>):route.startsWith('/new-listing')?gate(['Farmer','Admin'],<NewListing key={route+user?.id} farmerId={route.split('/')[2]||user?.farmer?.id||''} user={user!} currency={config.currency} notify={notify}/>):route==='/verifications'?gate(['Agent'],<AgentWorkspace/>):route==='/admin'?gate(['Admin'],<><Admin notify={notify}/><AdminListingReport/><ProducePriceReferences/><AdminGuestOrders/></>):route==='/settings'?gate(['Buyer','Farmer','Admin','Agent'],<>{identity&&<div className="security-settings"><div><strong>Sign-in & security</strong><p>Manage your email, password and connected accounts.</p></div><button className="secondary" onClick={identity.manage}><ShieldCheck size={17}/>Manage sign-in</button></div>}<SettingsPage user={user!} config={config} update={setUser} notify={notify}/></>):route==='/help'?<Help config={config} onOpenUssd={()=>setUssdOpen(true)}/>:<Empty title="This page hasn’t taken root" action={<Link className="button primary" href="/marketplace">Explore marketplace</Link>}>The page may have moved. Find fresh produce in the marketplace.</Empty>}
 </main><footer className="page-footer"><span>© {new Date().getFullYear()} Wirefen</span><span>Connecting farms. Growing possibilities.</span><Link href="/help">Need a hand?</Link></footer></div></div><nav className="mobile-bottom-nav" aria-label="Mobile navigation"><Link href="/marketplace" aria-current={route==='/marketplace'?'page':undefined}><LayoutGrid size={20}/>Market</Link><Link href="/saved" aria-current={route==='/saved'?'page':undefined}><Bookmark size={20}/>Saved</Link><Link href={user?.role==='Farmer'?'/farm':user?.role==='Agent'?'/verifications':'/requests'} aria-current={route===(user?.role==='Farmer'?'/farm':user?.role==='Agent'?'/verifications':'/requests')?'page':undefined}>{user?.role==='Farmer'?<Tractor size={20}/>:user?.role==='Agent'?<ShieldCheck size={20}/>:<ClipboardList size={20}/>}{user?.role==='Farmer'?'Farm':user?.role==='Agent'?'Verifications':'Requests'}</Link><Link href="/get-app" aria-current={route==='/get-app'?'page':undefined}><Download size={20}/>Get app</Link></nav><InstallInvitation pwa={pwa}/><div className={'toast '+(notice?'visible':'')} role="status" aria-live="polite">{notice&&<><CheckCircle2 size={18}/>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={16}/></button></>}</div>{auth&&<AuthDialog config={config} close={()=>setAuth(false)} onLogin={u=>{setUser(u);writeLocal('wirefen-session',u);setAuth(false);notify(`Welcome, ${u.name.split(' ')[0]}.`);}}/>}{ussdOpen&&<UssdSimulatorModal close={()=>setUssdOpen(false)}/>}</>;

}

function AuthDialog({config,close,onLogin}:{config:Config;close:()=>void;onLogin:(u:User)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [register,setRegister]=useState(false),[role,setRole]=useState('Buyer'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();const d=dialog.current;return()=>d?.close();},[]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');setBusy(true);const d=new FormData(e.currentTarget);try{const country=String(d.get('country')||'South Africa');const region=String(d.get('region')||'');const locality=String(d.get('locality')||'');const location=role==='Farmer'?[locality,region,country].filter(Boolean).join(', '):undefined;onLogin(await send<User>(register?'/auth/register':'/auth/login',register?{name:d.get('name'),phone:d.get('phone'),password:d.get('password'),role,sms_opt_in:d.get('sms')==='on',farm_name:d.get('farm_name')||undefined,country,region,locality,district:region,ward:locality,location}:{phone:d.get('phone'),password:d.get('password')}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function demo(role:string){setBusy(true);setError('');try{onLogin(await send<User>('/auth/demo',{role}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

 return <dialog ref={dialog} className="auth-dialog" onCancel={close} aria-labelledby="auth-title"><button className="dialog-close icon-button" aria-label="Close sign in" onClick={close}><X size={22}/></button><div className="auth-brand"><Sprout size={28}/></div><h2 id="auth-title">{register?'Let’s grow together.':'Welcome to Wirefen.'}</h2><p>{register?'A new connection starts here.':'Your farm-to-market network, all in one place.'}</p><ErrorBox error={error}/><form onSubmit={submit}>{register&&<><div className="segmented">{['Buyer','Farmer'].map(r=><button key={r} type="button" aria-pressed={role===r} className={role===r?'selected':''} onClick={()=>setRole(r)}>{r==='Buyer'?'I’m buying':'I’m growing'}</button>)}</div><Field label="Full name"><input name="name" required minLength={2} maxLength={100} autoComplete="name"/></Field></>}<Field label="Phone number" hint="Include your country code, for example +27821234567."><input name="phone" type="tel" required pattern="\+[1-9][0-9]{7,14}" autoComplete="tel" placeholder="+27"/></Field><Field label="Password" hint={register?'Use at least 10 characters.':undefined}><input name="password" type="password" required minLength={register?10:1} maxLength={128} autoComplete={register?'new-password':'current-password'}/></Field>{register&&role==='Farmer'&&<><Field label="Farm name"><input name="farm_name" required maxLength={100} placeholder="e.g. Farm name"/></Field><div className="form-grid"><Field label="Country" hint="Standardized country"><CountrySelect/></Field><Field label="District / Region" hint="District or province"><input name="region" required maxLength={100} placeholder="e.g. District / Province"/></Field></div><Field label="Locality / Ward" hint="Local ward or community zone"><input name="locality" required maxLength={100} placeholder="e.g. Ward / Town"/></Field></>}{register&&<label className="checkbox-label consent"><input type="checkbox" name="sms"/>I agree to receive Wirefen SMS updates. I can opt out at any time.</label>}<button className="primary full-width" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}<ArrowRight size={17}/></button></form><button className="text-button auth-switch" onClick={()=>{setRegister(!register);setError('');}}>{register?'Already have an account? Sign in':'New to Wirefen? Create an account'}</button></dialog>;
}

function PaymentModal({order,close,onSuccess,notify}:{order:Order;close:()=>void;onSuccess:(p:Payment)=>void;notify:(s:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [currency,setCurrency]=useState<string>(order.currency||'MWK');
 const [method,setMethod]=useState<'malawian_bank'|'airtel_money_mw'|'tnm_mpamba'|'zambian_momo'>('malawian_bank');
 const [bankName,setBankName]=useState('National Bank of Malawi');
 const [accountOrPhone,setAccountOrPhone]=useState('');
 const [amount,setAmount]=useState<string>(()=>{
  const basePerKg=currency==='MWK'?1500:currency==='ZMW'?25:currency==='USD'?0.8:12.5;
  return String(Math.round(order.volume*basePerKg));
 });
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);

 const handleCurrencyChange=(newCur:string)=>{
  setCurrency(newCur);
  const basePerKg=newCur==='MWK'?1500:newCur==='ZMW'?25:newCur==='USD'?0.8:12.5;
  setAmount(String(Math.round(order.volume*basePerKg)));
 };

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  setBusy(true);
  setError('');
  try{
   const provider=method==='malawian_bank'?`${bankName} (Direct Debit)`:method==='airtel_money_mw'?'Airtel Money Malawi':method==='tnm_mpamba'?'TNM Mpamba':'Zambian Mobile Money';
   const res=await send<Payment>('/payments',{order_id:order.id,amount:Number(amount),currency,method,provider,bank_name:method==='malawian_bank'?bankName:undefined,account_or_phone:accountOrPhone});
   notify(`Direct payment of ${currency} ${Number(amount).toLocaleString()} confirmed.`);
   onSuccess(res);
  }catch(err){
   setError((err as Error).message);
  }finally{
   setBusy(false);
  }
 }

 return (
  <dialog ref={dialog} className="payment-dialog" onCancel={close} aria-labelledby="pay-title">
   <button className="dialog-close icon-button" aria-label="Close" onClick={close}><X size={20}/></button>
   <div className="auth-brand" style={{background:'#e3f2dc',color:'#234c36'}}><CreditCard size={26}/></div>
   <h2 id="pay-title">Direct Order Payment</h2>
   <p>Direct settlement for buyers in Malawi and Zambia using local bank accounts or mobile money.</p>
   <div className="payment-order-summary">
    <div className="summary-row"><span>Produce requested:</span><strong>{order.title}</strong></div>
    <div className="summary-row"><span>Quantity:</span><strong>{number(order.volume)} kg</strong></div>
    <div className="summary-row"><span>Delivery to:</span><span>{order.delivery_location}</span></div>
    <div className="summary-row summary-total"><span>Payable amount:</span><strong>{currency} {Number(amount||0).toLocaleString()}</strong></div>
   </div>
   <ErrorBox error={error}/>
   <form onSubmit={submit}>
    <div className="form-grid">
     <Field label="Settlement Currency">
      <select value={currency} onChange={e=>handleCurrencyChange(e.target.value)}>
       <option value="MWK">Malawian Kwacha (MWK MK)</option>
       <option value="ZMW">Zambian Kwacha (ZMW ZK)</option>
       <option value="ZAR">South African Rand (ZAR R)</option>
       <option value="USD">US Dollar (USD $)</option>
       <option value="EUR">Euro (EUR ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬)</option>
      </select>
     </Field>
     <Field label="Amount to Settle">
      <input type="number" required min="1" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
     </Field>
    </div>
    <Field label="Select Payment Channel">
     <div className="payment-methods-grid">
      <div className={`method-card ${method==='malawian_bank'?'selected':''}`} onClick={()=>setMethod('malawian_bank')}>
       <strong><Building2 size={16}/> Malawian Bank Account</strong>
       <small>National Bank, Standard Bank, FDH, NBS, Ecobank</small>
      </div>
      <div className={`method-card ${method==='airtel_money_mw'?'selected':''}`} onClick={()=>setMethod('airtel_money_mw')}>
       <strong><Smartphone size={16}/> Airtel Money (Malawi)</strong>
       <small>Push USSD prompt to phone</small>
      </div>
      <div className={`method-card ${method==='tnm_mpamba'?'selected':''}`} onClick={()=>setMethod('tnm_mpamba')}>
       <strong><Smartphone size={16}/> TNM Mpamba</strong>
       <small>Instant Mpamba wallet debit</small>
      </div>
      <div className={`method-card ${method==='zambian_momo'?'selected':''}`} onClick={()=>setMethod('zambian_momo')}>
       <strong><Smartphone size={16}/> Zambian Mobile Money</strong>
       <small>MTN, Airtel Zambia, Zamtel</small>
      </div>
     </div>
    </Field>
    {method==='malawian_bank'&&(<>
     <Field label="Malawian Bank" hint="Select your bank">
      <select value={bankName} onChange={e=>setBankName(e.target.value)}>
       <option value="National Bank of Malawi">National Bank of Malawi (Mo626 / Direct)</option>
       <option value="Standard Bank Malawi">Standard Bank Malawi</option>
       <option value="FDH Bank">FDH Bank</option>
       <option value="NBS Bank">NBS Bank</option>
       <option value="Ecobank Malawi">Ecobank Malawi</option>
       <option value="Centenary Bank">Centenary Bank (Malawi)</option>
      </select>
     </Field>
     <Field label="Bank Account / Debit Card Number" hint="Your account number or debit card">
      <input required placeholder="e.g. 1004589234 or card number" value={accountOrPhone} onChange={e=>setAccountOrPhone(e.target.value)}/>
     </Field>
    </>)}
    {(method==='airtel_money_mw'||method==='tnm_mpamba'||method==='zambian_momo')&&(
     <Field label="Mobile Wallet Phone Number" hint={method==='airtel_money_mw'?'e.g. +265991234567 (Airtel)':method==='tnm_mpamba'?'e.g. +265881234567 (TNM)':'e.g. +260971234567 (Zambia)'}>
      <input required type="tel" placeholder="+265..." value={accountOrPhone} onChange={e=>setAccountOrPhone(e.target.value)}/>
     </Field>
    )}
    <button className="primary full-width" disabled={busy} style={{marginTop:16}}>{busy?'Authorizing settlementÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦':`Pay ${currency} ${Number(amount||0).toLocaleString()} Now`}<ArrowRight size={16}/></button>
   </form>
  </dialog>
 );
}

function ReceiptModal({payment,close}:{payment:Payment;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return (
  <dialog ref={dialog} className="payment-dialog" onCancel={close}>
   <button className="dialog-close icon-button" onClick={close}><X size={20}/></button>
   <div className="receipt-card">
    <div className="receipt-badge"><Check size={28}/></div>
    <h3>Payment Successful!</h3>
    <p className="muted">Receipt Reference: <strong>{payment.reference}</strong></p>
    <div className="receipt-details">
     <div className="row"><span>Status:</span><strong style={{color:'#2c5b20'}}>COMPLETED</strong></div>
     <div className="row"><span>Amount Settled:</span><strong>{payment.currency} {payment.amount.toLocaleString()}</strong></div>
     <div className="row"><span>Method / Channel:</span><span>{payment.provider} {payment.bank_name?`(${payment.bank_name})`:''}</span></div>
     <div className="row"><span>Account / Phone:</span><span>{payment.account_or_phone}</span></div>
     <div className="row"><span>Date & Time:</span><span>{new Date(payment.created_at).toLocaleString('en-GB')}</span></div>
    </div>
   </div>
   <button className="secondary full-width" onClick={close}>Done / Close</button>
  </dialog>
 );
}

export function UssdSimulatorModal({close}:{close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [phone,setPhone]=useState('+265991234567');
 const [screenText,setScreenText]=useState('DIAL *211# TO ACCESS WIREFEN OFFLINE SERVICES');
 const [inputVal,setInputVal]=useState('*211#');
 const [history,setHistory]=useState<string[]>([]);
 const [activeSession,setActiveSession]=useState(false);
 const [loading,setLoading]=useState(false);

 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);

 async function dialOrSend(overrideText?:string){
  const textToSend=overrideText!==undefined?overrideText:inputVal.trim();
  setLoading(true);
  try{
   let combined=textToSend;
   if(activeSession&&textToSend!=='*211#')combined=[...history,textToSend].join('*');
   else setHistory([]);
   const res=await send<UssdSimulateResult>('/ussd/simulate',{phoneNumber:phone,text:combined,serviceCode:'*211#'});
   setScreenText(res.menuText);
   setInputVal('');
   if(res.isEnd){
    setActiveSession(false);
    setHistory([]);
   }else{
    setActiveSession(true);
    if(textToSend!=='*211#')setHistory(h=>[...h,textToSend]);
   }
  }catch(err){
   setScreenText('Connection error. Dial *211# to retry.');
   setActiveSession(false);
  }finally{
   setLoading(false);
  }
 }

 function handleEnd(){
  setActiveSession(false);
  setHistory([]);
  setScreenText('Call Ended.\nDial *211# to start again.');
  setInputVal('*211#');
 }

 return (
  <dialog ref={dialog} className="ussd-modal" onCancel={close}>
   <div className="phone-case">
    <button className="dialog-close icon-button" style={{color:'#99a89c'}} onClick={close}><X size={18}/></button>
    <div className="phone-speaker"/>
    <div className="phone-screen">
     <div className="phone-screen-bar">
      <span>ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â²ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â²ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â²ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â²ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â² Airtel MW</span>
      <span>{activeSession?'ACTIVE USSD':'STANDBY'}</span>
     </div>
     <div className="phone-screen-text">{loading?'ConnectingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦':screenText}</div>
     <div className="phone-input-bar">
      <input className="phone-input" value={inputVal} placeholder={activeSession?'Option (e.g. 1)':'*211#'} onChange={e=>setInputVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')dialOrSend();}}/>
     </div>
    </div>
    <div className="phone-keypad">
     {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k=>(
      <button key={k} className="keypad-btn" type="button" onClick={()=>setInputVal(v=>v+k)}>{k}</button>
     ))}
     <button className="keypad-btn keypad-call" type="button" onClick={()=>dialOrSend()}>{activeSession?'Send':'Dial *211#'}</button>
     <button className="keypad-btn" type="button" onClick={()=>setInputVal(v=>v.slice(0,-1))}>Del</button>
     <button className="keypad-btn keypad-end" type="button" onClick={handleEnd}>End</button>
    </div>
    <div className="ussd-quick-chips">
     <span style={{fontSize:11,color:'#859688',width:'100%',marginBottom:2}}>Quick test scenarios:</span>
     <button type="button" className="ussd-chip" onClick={()=>{setInputVal('*211#');dialOrSend('*211#');}}>Dial *211#</button>
     <button type="button" className="ussd-chip" onClick={()=>dialOrSend('3')}>Check Prices</button>
     <button type="button" className="ussd-chip" onClick={()=>dialOrSend('1*Chisomo Phiri*1*Kasungu*Chulu')}>Fast Farmer Signup</button>
    </div>
   </div>
  </dialog>
 );
}

function Requests({user,notify}:{user:User;notify:(s:string)=>void}){
 const [orders,setOrders]=useState<Order[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [payingOrder,setPayingOrder]=useState<Order|null>(null);
 const [receipt,setReceipt]=useState<Payment|null>(null);
 const load=()=>{setLoading(true);api<Order[]>('/orders').then(setOrders).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
 useEffect(load,[]);
 async function update(id:string,status:string){try{await send('/orders/'+id,{status},'PATCH');setOrders(orders.map(o=>o.id===id?{...o,status}:o));notify('Request status updated.');}catch(e){setError((e as Error).message);}}
 return <>
  <div className="page-heading">
   <div>
    <h1>{user.role==='Admin'?'Order request queue':'Your order requests'}</h1>
    <p>{user.role==='Admin'?'Connect buyers with the right growers and verify payments.':'From a good find to your next delivery with direct settlement.'}</p>
   </div>
   <button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button>
  </div>
  <ErrorBox error={error}/>
  {loading?<div className="loading">Loading requestsÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</div>:orders.length?<div className="table-wrap"><table>
   <thead><tr>
    <th>Produce / request</th>
    {user.role==='Admin'&&<th>Buyer</th>}
    <th>Quantity</th>
    <th>Location & notes</th>
    <th>Submitted</th>
    <th>Status</th>
    <th>Payment</th>
   </tr></thead>
   <tbody>{orders.map(o=><tr key={o.id}>
    <td><Link className="table-title" href={'/produce/'+o.listing_id}>{o.title}</Link><small>#{o.id.slice(0,8)}</small></td>
    {user.role==='Admin'&&<td>{o.buyer_name}<small>{o.phone}</small></td>}
    <td>{number(o.volume)} kg</td>
    <td>{o.delivery_location}{o.notes&&<small>{o.notes}</small>}</td>
    <td>{new Date(o.created_at).toLocaleDateString('en-GB')}</td>
    <td>{user.role==='Admin'?<select aria-label={'Status for '+o.title} value={o.status} onChange={e=>update(o.id,e.target.value)}>{['New','In review','Contacted','Closed'].map(s=><option key={s}>{s}</option>)}</select>:<span className={'status status-'+o.status.toLowerCase().replace(' ','-')}>{o.status}</span>}</td>
    <td>{o.payment_status==='paid'?<span className="status status-paid"><Check size={12}/> Paid ({o.currency||'MWK'} {o.amount_paid?number(o.amount_paid):''})<small>{o.payment_ref}</small></span>:user.role==='Buyer'?<button className="button primary compact" onClick={()=>setPayingOrder(o)}><CreditCard size={13}/> Pay Direct</button>:<span className="status status-new">Unpaid</span>}</td>
   </tr>)}</tbody>
  </table></div>:<Empty title="Your next connection starts here" action={<Link className="button primary" href="/marketplace">Explore produce <ArrowRight size={16}/></Link>}>Send an inquiry on any produce listing. You can follow its progress here.</Empty>}
  <p className="footnote"><CreditCard size={15}/> Direct payments supported via Malawian Bank Accounts (National Bank of Malawi, Standard Bank, FDH, NBS, Ecobank), Airtel Money, and TNM Mpamba in Malawian Kwacha (MWK) and Zambian Kwacha (ZMW).</p>
  {payingOrder&&<PaymentModal order={payingOrder} close={()=>setPayingOrder(null)} onSuccess={p=>{setPayingOrder(null);setReceipt(p);setOrders(orders.map(o=>o.id===p.order_id?{...o,payment_status:'paid',payment_ref:p.reference,payment_method:p.provider,amount_paid:p.amount,currency:p.currency,status:o.status==='New'?'In review':o.status}:o));}} notify={notify}/>}
  {receipt&&<ReceiptModal payment={receipt} close={()=>setReceipt(null)}/>}
  <BulkRequests user={user} signIn={()=>go('/marketplace')} notify={notify}/>
 </>;
}

function Farm({user,money}:{user:User;money:(v:number)=>string}){const [listings,setListings]=useState<Listing[]>([]),[error,setError]=useState('');useEffect(()=>{api<Listing[]>('/listings?mine=true').then(setListings).catch(e=>setError(e.message));},[]);return <><div className="page-heading"><div><h1>{user.farmer?.farm_name}</h1><p><MapPin size={15}/>{user.farmer?.location} Ãƒâ€šÃ‚Â· {user.farmer?.verification_status}</p></div><Link className="button primary" href="/new-listing"><Plus size={17}/>List produce</Link></div><section className="farm-baseline-banner"><div className="farm-avatar"><Sprout size={30}/></div><div><h2>A little history. A stronger future.</h2><p>Record your usual yield, growing time and production costs. Save as you go.</p></div><Link className="button secondary" href="/baseline">Your growing history <ArrowRight size={16}/></Link></section><div className="catalog-heading"><h2>Your produce listings</h2><span>{listings.length} listings</span></div><ErrorBox error={error}/>{listings.length?<div className="table-wrap"><table><thead><tr><th>Produce</th><th>Volume</th><th>Price / unit</th><th>Harvest</th><th>Available until</th><th>Listing</th></tr></thead><tbody>{listings.map(l=><tr key={l.id}><td className="table-product"><img src={l.image} alt=""/><div><strong>{l.title}</strong><small>{l.crop_category}</small></div></td><td>{number(l.available_volume)} {l.sale_unit||'kg'}</td><td>{money(l.price)}</td><td>{date(l.harvest_date)}</td><td>{date(l.expiration_date)}</td><td><Link className="text-button" href={'/produce/'+l.id}>View <ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table></div>:<Empty title="LetÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s get your harvest out there" action={<Link className="button primary" href="/new-listing">Create your first listing</Link>}>Your published produce will appear here.</Empty>}</>;}

type BaselineData={crop_type?:string;avg_land_size?:number;avg_yield_per_acre?:number;avg_duration_days?:number;cost_fertilizer_seeds?:number;cost_labor?:number;cost_processing?:number;cost_transportation?:number;avg_production_cost?:number;status?:string};
function Baseline({farmerId,user,online,currency,notify}:{farmerId:string;user:User;online:boolean;currency:string;notify:(s:string)=>void}){
 const key=`wirefen-baseline-${user.id}-${farmerId}`;const [data,setData]=useState<BaselineData>({}),[step,setStep]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false),[saveState,setSaveState]=useState(''),[done,setDone]=useState(false),[dirty,setDirty]=useState(false);const revision=useRef(0);const fields=[['crop_type','avg_land_size'],['avg_yield_per_acre','avg_duration_days'],['cost_fertilizer_seeds','cost_labor','cost_processing','cost_transportation','avg_production_cost']];
 useEffect(()=>{let alive=true;const local=readPrivate<{data:BaselineData;step:number;dirty:boolean}|null>(key,null);if(local){setData(local.data);setStep(local.step);setDirty(local.dirty);}api<BaselineData>('/farmers/'+farmerId+'/baseline').then(server=>{if(alive&&!local?.dirty){setData(Object.fromEntries(Object.entries(server).filter(([,v])=>v!==null)));setSaveState(server.status==='complete'?'Previously completed':'Draft loaded');}}).catch(e=>{if(alive)setError(navigator.onLine?e.message:'You can enter your history offline. It will sync when you reconnect.');}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[farmerId,key]);
 useEffect(()=>{if(!ready||!dirty||done)return;const stored=writePrivate(key,{data,step,dirty:true});setSaveState(stored?'Kept in this open page':'Keep this page open.');if(!online)return;const current=revision.current;const timer=setTimeout(async()=>{setSaving(true);try{await send('/farmers/'+farmerId+'/baseline',{...Object.fromEntries(Object.entries(data).filter(([k])=>[...costFields,'crop_type','avg_land_size','avg_yield_per_acre','avg_duration_days'].includes(k))),status:'draft'},'PATCH');if(current===revision.current){setSaveState('All changes saved');setDirty(false);writePrivate(key,{data,step,dirty:false});setError('');}}catch(e){setSaveState('Saved locally Ãƒâ€šÃ‚Â· sync pending');setError((e as Error).message);}finally{setSaving(false);}},900);return()=>clearTimeout(timer);},[data,step,online,ready,dirty,done,key,farmerId]);
 const change=(field:string,value:string,numeric=false)=>{revision.current++;setData(d=>({...d,[field]:numeric?(value===''?undefined:Number(value)):value}));setDirty(true);setDone(false);};
 const updateCost=(field:'cost_fertilizer_seeds'|'cost_labor'|'cost_processing'|'cost_transportation',val:string)=>{revision.current++;const num=val===''?undefined:Number(val);setData(d=>{const next={...d,[field]:num};const sum=costTotal(next);return {...next,avg_production_cost:sum};});setDirty(true);setDone(false);};
 async function next(e:FormEvent<HTMLFormElement>){e.preventDefault();if(step<3){setStep(step+1);writePrivate(key,{data,step:step+1,dirty});return;}if(!online){setError('Reconnect to submit your completed history. Keep this page open to retain your unsynced draft.');return;}setSaving(true);setError('');try{await send('/farmers/'+farmerId+'/baseline',{...Object.fromEntries(Object.entries(data).filter(([k])=>[...costFields,'crop_type','avg_land_size','avg_yield_per_acre','avg_duration_days'].includes(k))),status:'complete'},'PATCH');setDone(true);setDirty(false);writePrivate(key,{data:{...data,status:'complete'},step:0,dirty:false});notify('Your growing history is complete.');}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
 return <><Link className="back-link" href={user.role==='Admin'?'/admin':'/farm'}><ArrowLeft size={16}/>{user.role==='Admin'?'Back to admin assist':'Back to my farm'}</Link><div className="page-heading"><div><h1>Your growing history</h1><p>Tell us what a typical growing season looks like. Estimates are welcome.</p></div><span className="save-state"><CloudState saving={saving}/>{saving?'SavingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦':saveState||'Form 0 Ãƒâ€šÃ‚Â· Baseline'}</span></div>{user.role==='Admin'&&<div className="info-box">Assisted entry Ãƒâ€šÃ‚Â· Farmer ID: {farmerId}</div>}{!ready?<div className="loading">Loading your draftÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</div>:done?<Empty title="A stronger season starts with good records." action={<Link className="button primary" href={user.role==='Admin'?'/admin':'/farm'}>Back to your workspace <ArrowRight size={16}/></Link>}>Your growing history has been submitted. You can return to update it as your farm grows.</Empty>:<div className="wizard-layout"><aside className="wizard-steps" aria-label="Form progress"><p>Growing history</p><ol>{['Your crop & land','Yield & growing time','Production costs','Review & submit'].map((label,i)=><li key={label} className={i===step?'current':i<step?'complete':''}><span>{i<step?<Check size={16}/>:i+1}</span><div>{label}{i===step&&<small>Current step</small>}</div></li>)}</ol><div className="wizard-help"><WifiOff size={20}/><h3>Keep this page open while offline.</h3><p>Drafts are saved on this device and synced when youÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢re back online.</p></div></aside><div className="wizard-form"><div className="step-header"><span>Step {step+1} of 4</span><span>{Math.round((step+1)/4*100)}% complete</span></div><progress value={step+1} max={4} aria-label="Growing history progress"/><h2>{['What do you grow?','How does your crop perform?','What does a season cost?','One last look.'][step]}</h2><p className="muted">{['Start with the crop you grow most often.','Use an average from your past growing seasons.','Form 1 Guided Breakdown: Input expected spend across key operational categories. Total is automatically aggregated.','Review your figures before submitting your growing history.'][step]}</p><ErrorBox error={error}/><form onSubmit={next}>{step===0&&<><Field label="Primary crop"><input required minLength={2} maxLength={80} value={data.crop_type||''} onChange={e=>change('crop_type',e.target.value)} placeholder="e.g. Tomatoes"/></Field><Field label="Average land planted (acres)" hint="The area usually dedicated to this crop, rather than your total farm size."><input type="number" required min="0.01" max="10000000" step="0.01" value={data.avg_land_size??''} onChange={e=>change('avg_land_size',e.target.value,true)} placeholder="e.g. 12"/></Field></>}{step===1&&<><Field label="Average yield (kg per acre)"><input type="number" required min="0.01" max="1000000000" step="0.01" value={data.avg_yield_per_acre??''} onChange={e=>change('avg_yield_per_acre',e.target.value,true)} placeholder="e.g. 2500"/></Field><Field label="Average growing duration (days)" hint="From planting to harvest."><input type="number" required min="1" max="3650" step="1" value={data.avg_duration_days??''} onChange={e=>change('avg_duration_days',e.target.value,true)} placeholder="e.g. 90"/></Field></>}{step===2&&<><div className="form-grid"><Field label={`1. Fertilizer and seeds spend (${currency})`} hint="Expected spend on seeds, fertilizers, and crop treatments."><input type="number" required min="0" max="1000000000000" step="0.01" value={data.cost_fertilizer_seeds??''} onChange={e=>updateCost('cost_fertilizer_seeds',e.target.value)} placeholder="e.g. 4000"/></Field><Field label={`2. Labor spend (${currency})`} hint="Expected spend for planting, weeding, and ongoing maintenance."><input type="number" required min="0" max="1000000000000" step="0.01" value={data.cost_labor??''} onChange={e=>updateCost('cost_labor',e.target.value)} placeholder="e.g. 5000"/></Field></div><div className="form-grid"><Field label={`3. Processing spend (${currency})`} hint="Expected spend to prepare the harvest for storage."><input type="number" required min="0" max="1000000000000" step="0.01" value={data.cost_processing??''} onChange={e=>updateCost('cost_processing',e.target.value)} placeholder="e.g. 3000"/></Field><Field label={`4. Transportation spend (${currency})`} hint="Expected spend to move produce from the farm."><input type="number" required min="0" max="1000000000000" step="0.01" value={data.cost_transportation??''} onChange={e=>updateCost('cost_transportation',e.target.value)} placeholder="e.g. 3000"/></Field></div><Field label={`Total Estimated Cost / Average production cost (${currency} per season)`} hint="Calculated from all four categories. Enter 0 for a category with no expected spend."><input type="number" required min="0" max="1000000000000" step="0.01" readOnly value={costTotal(data)} placeholder="e.g. 15000"/></Field></>}{step===3&&<dl className="review-list">{[['Primary crop',data.crop_type],['Land planted',`${data.avg_land_size??'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'} acres`],['Average yield',`${data.avg_yield_per_acre??'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'} kg / acre`],['Growing duration',`${data.avg_duration_days??'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'} days`],...(data.cost_fertilizer_seeds!=null||data.cost_labor!=null||data.cost_processing!=null||data.cost_transportation!=null?[['1. Fertilizer & seeds',`${currency} ${number(data.cost_fertilizer_seeds||0)}`],['2. Labor',`${currency} ${number(data.cost_labor||0)}`],['3. Processing',`${currency} ${number(data.cost_processing||0)}`],['4. Transportation',`${currency} ${number(data.cost_transportation||0)}`]]:[]),['Total Estimated Cost',`${currency} ${number(data.avg_production_cost||0)}`]].map(([label,v])=><div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl>}<div className="wizard-buttons"><button type="button" className="secondary" disabled={step===0||saving} onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>Back</button><button type="submit" className="primary" disabled={saving}>{step===3?'Submit growing history':'Continue'}<ArrowRight size={16}/></button></div><div className="draft-note"><CheckCircle2 size={15}/>Changes save to your account while online. Keep this page open until all changes are saved.</div></form></div></div>}</>;
}
function CloudState({saving}:{saving:boolean}){return saving?<Clock size={16}/>:<CheckCheck size={16}/>;}

function NewListing({farmerId,user,currency,notify}:{farmerId:string;user:User;currency:string;notify:(s:string)=>void}){const key=`wirefen-listing-${user.id}-${farmerId}`;const [draft,setDraft]=useState<Record<string,string>>(()=>readLocal(key,{crop_category:'Vegetables',preservative_used:'false'}));const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[ready,setReady]=useState(false),[connected,setConnected]=useState(navigator.onLine);const draftRevision=useRef(0);useEffect(()=>{const on=()=>setConnected(true),off=()=>setConnected(false);window.addEventListener('online',on);window.addEventListener('offline',off);const local=readLocal<Record<string,string>|null>(key,null);api<Record<string,string>>('/farmers/'+farmerId+'/listing-draft').then(server=>{if(!local&&Object.keys(server).length)setDraft(server);else if(local)setDirty(true);}).catch(()=>{}).finally(()=>setReady(true));return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[key,farmerId]);useEffect(()=>{if(!ready||!dirty||!connected)return;const current=draftRevision.current;const timer=setTimeout(()=>{send('/farmers/'+farmerId+'/listing-draft',draft,'PATCH').then(()=>{if(current===draftRevision.current)setDirty(false);}).catch(()=>setError('Draft saved on this device. Server sync will retry when you reconnect.'));},800);return()=>clearTimeout(timer);},[draft,dirty,ready,connected,farmerId]);const saleUnit=guestLimitFor(draft.title||'')?.unit||'kg';const update=(name:string,value:string)=>{draftRevision.current++;const d={...draft,[name]:value};setDraft(d);setDirty(true);writeLocal(key,d);};async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(step<2){setStep(step+1);return;}setBusy(true);setError('');try{await send('/listings',{...draft,farmer_id:farmerId,available_volume:Number(draft.available_volume),sale_unit:saleUnit,price:Number(draft.price),shelf_life_days:Number(draft.shelf_life_days),preservative_used:draft.preservative_used==='true'});localStorage.removeItem(key);setDirty(false);notify('Your produce is now on the marketplace.');go(user.role==='Admin'?'/admin':'/farm');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}const input=(name:string,label:string,type='text',extra:Record<string,unknown>={})=><Field label={label}><input required type={type} value={draft[name]||''} onChange={e=>update(name,e.target.value)} {...extra}/></Field>;return <><Link className="back-link" href={user.role==='Admin'?'/admin':'/farm'}><ArrowLeft size={16}/>Back to workspace</Link><div className="page-heading"><div><h1>Give your harvest a wider reach.</h1><p>Create a produce listing. Drafts save on this device and sync when connected.</p></div></div><div className="single-form"><div className="step-header"><span>Step {step+1} of 3</span><span>{['Produce details','Harvest & handling','Review & publish'][step]}</span></div><progress value={step+1} max={3} aria-label="Listing progress"/><ErrorBox error={error}/><form onSubmit={submit}>{step===0&&<><h2>WhatÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s ready for market?</h2>{input('title','Produce name','text',{minLength:3,maxLength:100,placeholder:'e.g. Fresh Roma tomatoes'})}<Field label="Category"><select value={draft.crop_category} onChange={e=>update('crop_category',e.target.value)}>{categories.slice(1).map(c=><option key={c.name}>{c.name}</option>)}</select></Field><div className="form-grid">{input('available_volume',`Available volume (${saleUnit})`,'number',{min:0.1,max:1e9,step:0.1})}{input('price',`Price (${currency} / ${saleUnit})`,'number',{min:0.01,max:1e9,step:0.01})}</div></>}{step===1&&<><h2>Freshness, from field to buyer.</h2><div className="form-grid">{input('harvest_date','Harvest date','date')}{input('expiration_date','Available until','date',{min:draft.harvest_date})}</div>{input('shelf_life_days','Shelf life (days)','number',{min:1,max:3650})}<Field label="Preservatives"><select value={draft.preservative_used} onChange={e=>update('preservative_used',e.target.value)}><option value="false">No preservatives used</option><option value="true">Preservatives used</option></select></Field><Field label="Description (optional)"><textarea maxLength={2000} rows={4} value={draft.description||''} onChange={e=>update('description',e.target.value)} placeholder="Tell buyers about the produce, packing and collection."/></Field></>}{step===2&&<><h2>Ready to meet your buyers?</h2><dl className="review-list">{[['Produce',draft.title],['Category',draft.crop_category],['Volume',`${draft.available_volume} ${saleUnit}`],['Price',`${currency} ${draft.price} / ${saleUnit}`],['Harvest',draft.harvest_date],['Available until',draft.expiration_date],['Shelf life',`${draft.shelf_life_days} days`],['Preservatives',draft.preservative_used==='true'?'Used':'None']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p className="info-box">A category photograph will illustrate your listing. Buyers can request packing and collection details.</p></>}<div className="wizard-buttons"><button className="secondary" type="button" disabled={step===0||busy} onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={busy}>{busy?'PublishingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦':step===2?'Publish listing':'Continue'}<ArrowRight size={16}/></button></div></form></div></>;}

function Admin({notify}:{notify:(s:string)=>void}){const [farmers,setFarmers]=useState<Farmer[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);useEffect(()=>{api<Farmer[]>('/farmers').then(setFarmers).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);const filtered=farmers.filter(f=>`${f.id} ${f.name} ${f.farm_name} ${f.phone} ${f.country||''} ${f.region||''} ${f.locality||''}`.toLowerCase().includes(search.toLowerCase()));function exportCsv(){const csv=['Farmer ID,Farm,Name,Phone,Country,District/Region,Locality/Ward,Location,Verification,Baseline',...filtered.map(f=>[f.id,f.farm_name,f.name,f.phone,f.country||'',f.region||f.district||'',f.locality||f.ward||'',f.location,f.verification_status,f.baseline_status||'Not started'].map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"').join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='wirefen-farmers.csv';a.click();URL.revokeObjectURL(url);notify('Farmer directory exported.');}return <><div className="page-heading"><div><h1>A helping hand, at every step.</h1><p>Find a farmer and capture their details while youÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢re on the phone.</p></div><button className="secondary" onClick={exportCsv}><Download size={16}/>Export directory</button></div><div className="assist-toolbar"><label className="search-field"><Search size={18}/><span className="sr-only">Find farmer</span><input placeholder="Search by name, phone or farmer IDÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" value={search} onChange={e=>setSearch(e.target.value)}/></label><Link className="button secondary" href="/requests"><ClipboardList size={17}/>Order request queue</Link></div><ErrorBox error={error}/>{selected&&<div className="selection-bar"><span><CheckCircle2 size={17}/>{farmers.find(f=>f.id===selected)?.farm_name} selected</span><div><Link className="button primary" href={'/new-listing/'+selected}><Plus size={16}/>Create listing</Link></div></div>}{loading?<div className="loading">Loading farmer directoryÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</div>:filtered.length?<div className="table-wrap"><table className="admin-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Farmer & ID</th><th>Contact</th><th>Location</th><th>Farm size</th><th>Verification</th><th>Growing history</th><th>Actions</th></tr></thead><tbody>{filtered.map(f=><tr key={f.id} className={f.id===selected?'selected-row':''}><td><input type="radio" name="farmer" checked={selected===f.id} onChange={()=>setSelected(f.id)} aria-label={'Select '+f.farm_name}/></td><td><strong>{f.farm_name}</strong><small>{f.id}</small></td><td>{f.name}<small>{f.phone}</small></td><td><strong>{f.location}</strong>{((f.country&&f.region)||f.locality)?<small>{[f.locality||f.ward,f.region||f.district,f.country].filter(Boolean).join(' Ãƒâ€šÃ‚Â· ')}</small>:null}</td><td>{number(f.farm_size)} acres</td><td><span className={'status '+(f.verification_status==='Verified'?'status-contacted':'')}>{f.verification_status}</span></td><td>{f.baseline_status==='complete'?<IconLabel><CheckCircle2 size={15}/>Complete</IconLabel>:f.baseline_status==='draft'?'Draft saved':'Not started'}</td><td><Link className="text-button" href={'/new-listing/'+f.id}>Create listing <ArrowRight size={15}/></Link></td></tr>)}</tbody></table></div>:<Empty title="No matching farmers">Try a different name, phone number, or farmer ID.</Empty>}<FinancialAnalytics/><VerificationAssignments/></>;}

function SettingsPage({user,config,update,notify}:{user:User;config:Config;update:(u:User)=>void;notify:(s:string)=>void}){const [busy,setBusy]=useState(false),[error,setError]=useState('');async function consent(value:boolean){setBusy(true);try{await send('/account/consent',{sms_opt_in:value},'PATCH');update({...user,sms_opt_in:value});notify(value?'SMS consent recorded.':'SMS consent withdrawn.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}return <><div className="page-heading"><div><h1>Your account, your preferences.</h1><p>Manage how you stay connected to Wirefen.</p></div></div><div className="settings-layout"><section className="settings-section"><h2>Account details</h2><dl className="review-list"><div><dt>Name</dt><dd>{user.name}</dd></div>{user.email&&<div><dt>Email</dt><dd>{user.email}</dd></div>}<div><dt>Phone</dt><dd>{user.phone}</dd></div><div><dt>Role</dt><dd>{user.role}</dd></div></dl><p className="muted">Your phone number connects your account and future SMS interactions.</p></section>{user.role==='Farmer'&&<LocationSettings user={user} update={update}/>}<section className="settings-section"><h2>SMS updates</h2><p>Receive Wirefen updates and use supported SMS data entry. You can withdraw consent here or reply STOP at any time.</p><ErrorBox error={error}/><label className="checkbox-label"><input type="checkbox" checked={user.sms_opt_in} disabled={busy} onChange={e=>consent(e.target.checked)}/>I agree to receive Wirefen SMS messages.</label><p className="info-box">{config.sms_ready?'SMS provider credentials are configured.':'SMS delivery is not connected yet. Your preference is recorded for when the service is activated.'}</p></section></div></>;}
function Help({config,onOpenUssd}:{config:Config;onOpenUssd?:()=>void}){return <><div className="page-heading"><div><h1>Good connections start with clarity.</h1><p>A few things to know about growing with Wirefen in Malawi, Zambia, and regional markets.</p></div></div><div className="help-layout"><section><h2>From farm to marketplace</h2>{[['How do I buy produce and make direct payments?','Explore the marketplace, filter by crop or volume, and open a listing. Sign in as a buyer to submit an order request. Buyers can make direct payments in Malawian Kwacha (MWK), Zambian Kwacha (ZMW) or ZAR using local bank accounts, Airtel Money, or TNM Mpamba.'],['Can I pay directly with a Malawian bank account?','Yes! Wirefen supports direct settlement for Malawian bank accounts (National Bank of Malawi Mo626, Standard Bank Malawi, FDH Bank, NBS Bank, Ecobank, Centenary Bank), Airtel Money Malawi, and TNM Mpamba in Malawian Kwacha (MWK). Buyers receive a digital receipt and transaction reference immediately.'],['How do farmers without internet access Wirefen via USSD (*211#)?','Smallholder farmers across rural Malawi and Zambia can dial *211# on any basic 2G/feature phone without internet. The interactive USSD menu enables farmer registration, buyer registration, live market price checking in MWK/ZMW, and Form 1 operational cost tracking.'],['Can farmers register via regular SMS in parallel?','Yes! In parallel to the website and USSD, farmers can register via SMS by texting: JOIN FARMER <Name>, <Country>, <District>, <Locality> to Wirefen. Their account and farm profile are created immediately.'],['How do I list my harvest?','Create a farmer account. In My farm, choose List produce, enter availability, price and harvest details, then publish. Your listing appears in the public catalogue until its expiration date.'],['What is growing history (Form 0 & Form 1)?','Your historical baseline describes a typical season: primary crop, land planted, yield per acre, growing duration and Form 1 Guided Breakdown costs (fertilizer/seeds, labor, processing, transportation). Estimates are welcome and help establish a foundation for supply planning.'],['What happens when I lose connection?','After your first online visit, the installed app caches its shell and catalogue. Private growing history drafts stay in the open page and sync when connectivity returns. Keep the page open until saving completes; reloading or signing out clears unsynced estimates. Publishing listings and submitting orders require a connection.'],['How does admin assistance work?','Authorized staff use the farmer directory to select a Farmer ID and create produce listings on that farmerÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s behalf. Order inquiries and payments are managed in the admin request queue.']].map(([title,body])=><details className="faq" key={title}><summary>{title}<Plus size={17}/></summary><p>{body}</p></details>)}</section><aside className="help-note"><Sprout size={32}/><h2>Built for the way you grow.</h2><p>Start small. Save as you go. Return when youÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢re ready.</p><Link className="button primary" href="/marketplace">Explore the marketplace <ArrowRight size={16}/></Link>{onOpenUssd&&<button className="button secondary full-width" style={{marginTop:12}} onClick={onOpenUssd}><Smartphone size={16}/>Launch *211# Phone Simulator</button>}{config.demo&&<small>This workspace contains illustrative farms and listings. Malawian Kwacha (MWK), Zambian Kwacha (ZMW), ZAR, USD, and EUR are active currencies.</small>}</aside></div></>;}
