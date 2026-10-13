import {useCallback,useEffect,useRef,useState} from 'react';
import {api,send,readLocal,writeLocal} from './api';
import {ArrowDownToLine,Check,Download,Share,Smartphone,Sprout,WifiOff,X} from 'lucide-react';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type InstallMemory={promptedAt?:string;dismissedAt?:string;installedAt?:string;source?:InstallSource;suppressed?:boolean};
type InstallSource='appinstalled'|'standalone'|'related-app';
type InstallState={prompted_at:string|null;dismissed_at:string|null;installed_at:string|null;suppress_prompt:boolean;device_installed:boolean};
const storageKey='wirefen-install-v1';
const inApp=()=>matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
const memory=()=>readLocal<InstallMemory>(storageKey,{});
const suppress=(m:InstallMemory)=>!!(m.installedAt||m.promptedAt||m.dismissedAt||m.suppressed);
export function useInstall({ready=true,userId,online=navigator.onLine}:{ready?:boolean;userId?:string;online?:boolean}={}){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(()=>inApp()||!!memory().installedAt),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [revision,refresh]=useState(0),[checked,setChecked]=useState(false),[invitation,setInvitation]=useState(false);
 const active=useRef(true);
 const remember=useCallback((event:'prompted'|'dismissed'|'installed',source?:InstallSource)=>{
  const record=memory(),key=event==='prompted'?'promptedAt':event==='dismissed'?'dismissedAt':'installedAt';
  if(!record[key])record[key]=new Date().toISOString();if(source)record.source=source;
  writeLocal(storageKey,record);try{sessionStorage.setItem(storageKey,'seen');}catch{}
  if(event==='installed'){setInstalled(true);setPrompt(null);}if(event!=='prompted')setInvitation(false);refresh(n=>n+1);
 },[]);
 useEffect(()=>{
  active.current=true;
  const capture=(event:Event)=>{event.preventDefault();if(!memory().installedAt&&!inApp())setPrompt(event as InstallPrompt);};
  const done=()=>{remember('installed','appinstalled');setMessage('Wirefen has been added to your apps.');};
  const display=matchMedia('(display-mode: standalone)');const changed=()=>{if(inApp())remember('installed','standalone');};
  const storage=(event:StorageEvent)=>{if(event.key===storageKey){if(suppress(memory()))setInvitation(false);if(memory().installedAt)setInstalled(true);refresh(n=>n+1);}};
  window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',done);window.addEventListener('storage',storage);display.addEventListener('change',changed);
  if(inApp())remember('installed','standalone');
  // Optional browser detection can find an installation even in a normal browser tab.
  const related=(navigator as Navigator&{getInstalledRelatedApps?:()=>Promise<{platform:string;url?:string;id?:string}[]>}).getInstalledRelatedApps;
  if(related)related.call(navigator).then(apps=>{if(active.current&&apps.some(a=>a.platform==='webapp'&&(new URL(a.url||a.id||'',location.origin).href===new URL('/manifest.webmanifest',location.origin).href||new URL(a.id||a.url||'',location.origin).href===new URL('/',location.origin).href)))remember('installed','related-app');}).catch(()=>{});
  return()=>{active.current=false;window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',done);window.removeEventListener('storage',storage);display.removeEventListener('change',changed);};
 },[remember]);
 useEffect(()=>{
  if(!ready||!online){setChecked(false);return;}let alive=true;setChecked(false);
  async function sync(){
   try{
    let remote=await api<InstallState>('/pwa/session');const local=memory();
    const event=local.installedAt?'installed':local.dismissedAt?'dismissed':local.promptedAt?'prompted':null;
    if(event)remote=await send<InstallState>('/pwa/events',{event,source:event==='installed'?(local.source||'standalone'):'invitation'});
    if(!alive)return;
    if(remote.installed_at)setInvitation(false);
    if(remote.suppress_prompt){writeLocal(storageKey,{...memory(),suppressed:true,...(remote.device_installed&&!memory().installedAt?{installedAt:remote.installed_at||new Date().toISOString()}: {})});if(remote.device_installed)setInstalled(true);}
    setChecked(true);
   }catch{ /* Keep local decisions; retry on reconnection. Do not prompt on an unknown account state. */ }
  }
  void sync();return()=>{alive=false;};
 },[ready,userId,online,revision]);
 useEffect(()=>{
  let seen=false;try{seen=sessionStorage.getItem(storageKey)==='seen';}catch{}
  if(!checked||installed||suppress(memory())||seen)return;
  const timer=setInterval(()=>{
   if(document.visibilityState!=='visible'||document.querySelector('dialog[open],.cl-modalBackdrop')||location.hash==='#/get-app')return;
   if(suppress(memory())){clearInterval(timer);return;}
   setInvitation(true);remember('prompted');clearInterval(timer);
  },3500);
  return()=>clearInterval(timer);
 },[checked,installed,remember]);
 const dismiss=()=>remember('dismissed');
 async function install(){if(!prompt||busy)return;setBusy(true);setMessage('');setInvitation(false);try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='dismissed'){remember('dismissed');setMessage('No problem. You can install Wirefen whenever you?re ready.');}else{remember('prompted');setMessage('Installation accepted. Look for Wirefen on your home screen or in your apps.');}setPrompt(null);}catch{setMessage('Installation could not open. Use your browser menu to add Wirefen.');location.hash='/get-app';}finally{setBusy(false);}}
 const openInstall=()=>{setInvitation(false);if(prompt)void install();else location.hash='/get-app';};
 return {available:!!prompt,installed,busy,message,install,invitation,dismiss,openInstall};
}
export function InstallInvitation({pwa}:{pwa:ReturnType<typeof useInstall>}){
 if(!pwa.invitation||pwa.installed)return null;
 return <aside className="install-invitation" aria-labelledby="install-invitation-title"><span className="invitation-icon"><Sprout size={26} aria-hidden="true"/></span><div><h2 id="install-invitation-title">Take Wirefen to the field.</h2><p>Add the app to your home screen. Keep your marketplace close and save farmer drafts offline.</p><div className="invitation-actions"><button className="primary" onClick={pwa.openInstall}><Download size={17} aria-hidden="true"/>{pwa.available?'Install app':'Get the app'}</button><button className="text-button" onClick={pwa.dismiss}>Not now</button></div></div><button className="icon-button invitation-close" aria-label="Dismiss install invitation" onClick={pwa.dismiss}><X size={18}/></button></aside>;
}
export function GetApp({pwa}:{pwa:ReturnType<typeof useInstall>}){
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 return <section className="get-app-page"><div className="page-heading"><div><span className="eyebrow">Wirefen, wherever you grow</span><h1>Your marketplace. In your pocket.</h1><p>Keep your next harvest a tap away.</p></div></div><div className="install-layout"><div className="install-card"><span className="install-app-icon"><Sprout size={40}/></span><h2>Get the Wirefen app</h2><p>Add Wirefen to your home screen for a focused, full-screen experience. It’s free and uses the same account.</p>{pwa.installed?<div className="installed-state" role="status"><Check size={20}/>You’re using the installed app.</div>:pwa.available?<button className="primary" disabled={pwa.busy} onClick={pwa.install}><Download size={18}/>{pwa.busy?'Opening installer…':'Install Wirefen'}</button>:<p className="install-hint">{ios?'On iPhone or iPad, open Wirefen in Safari and follow the steps below.':'Open Wirefen in Chrome or Edge, then look for Install app in your browser menu or address bar.'}</p>}<p className="install-message" role="status">{pwa.message}</p><div className="install-benefits"><div><Smartphone size={22}/><span><strong>Made for your phone</strong><small>Easy navigation and comfortable touch controls.</small></span></div><div><WifiOff size={22}/><span><strong>Keep growing offline</strong><small>Browse previously loaded produce and save farmer drafts on this device.</small></span></div></div></div><div className="install-guide"><h2>{ios?'Add to your home screen':'A little setup. A lot closer.'}</h2><ol><li><span>1</span><div><strong>{ios?'Open Safari’s Share menu':'Open your browser menu'}</strong><p>{ios?'Tap the Share button in Safari’s toolbar.':'In Chrome or Edge, open the menu next to the address bar.'}</p><Share size={18}/></div></li><li><span>2</span><div><strong>{ios?'Choose Add to Home Screen':'Choose Install app'}</strong><p>{ios?'Scroll down in the share sheet to find this option.':'On Android, this may be called Add to home screen. On desktop, look for the install icon in the address bar.'}</p><ArrowDownToLine size={18}/></div></li><li><span>3</span><div><strong>Make room for your next harvest</strong><p>Confirm the installation, then open Wirefen from its new icon.</p><Sprout size={18}/></div></li></ol><p className="install-footnote">Installation needs a supported browser and a secure HTTPS connection (or localhost for development). Sign-in and sending requests need an internet connection.</p></div></div></section>;
}
