import {demoApi} from './demo';
export const PRESENTATION_MODE=import.meta.env.VITE_USE_BACKEND!=='true';
export type Farmer={id:string;user_id:string;farm_name:string;location:string;farm_size:number;verification_status:string;name?:string;phone?:string;baseline_status?:string};
export type User={id:string;name:string;phone:string;email?:string;role:'Buyer'|'Farmer'|'Admin';sms_opt_in:boolean;farmer:Farmer|null};
export type Listing={id:string;farmer_id:string;title:string;crop_category:string;available_volume:number;price:number;harvest_date:string;expiration_date:string;shelf_life_days:number;preservative_used:number;description:string;image:string;farm_name:string;location:string;verification_status:string};
export type Order={id:string;listing_id:string;title:string;volume:number;delivery_location:string;notes:string;status:string;created_at:string;buyer_name:string;phone:string};
export type Config={demo:boolean;market:string;currency:string;sms_ready:boolean;presentation?:boolean;auth_provider?:'clerk'|'local';clerk_publishable_key?:string|null};
let getToken:(()=>Promise<string|null>)|undefined;
export function setTokenGetter(getter:typeof getToken){getToken=getter;}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 if(PRESENTATION_MODE)return await demoApi(path,options) as T;
 const token=await getToken?.();
 const response=await fetch('/api/v1'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to complete your request. Please try again.');return data;
}
export const send=<T,>(path:string,body:unknown,method='POST')=>api<T>(path,{method,body:JSON.stringify(body)});
export const number=(value:number)=>new Intl.NumberFormat('en-ZA',{maximumFractionDigits:1}).format(value);
export const date=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
export function readLocal<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
export function writeLocal(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
