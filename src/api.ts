import {demoApi} from './demo';
export const PRESENTATION_MODE=process.env.NEXT_PUBLIC_USE_BACKEND!=='true';
export type Farmer={id:string;user_id:string;farm_name:string;country?:string;country_code?:string;location_key?:string;region?:string;district?:string;locality?:string;ward?:string;location:string;farm_size:number;verification_status:string;name?:string;phone?:string;baseline_status?:string};
export type UserRole='Buyer'|'Farmer'|'Admin'|'Agent';
export type User={id:string;name:string;phone:string;email?:string;role:UserRole;sms_opt_in:boolean;farmer:Farmer|null};
export type Listing={guest_limit?:{name:string;max:number;unit:string}|null;verified?:boolean;sustainability_badge?:boolean;traceability?:string;country?:string;country_code?:string;region?:string;locality?:string;agent_score?:number|null;agent_verification_status?:string;id:string;farmer_id:string;title:string;crop_category:string;available_volume:number;sale_unit?:string;price:number;harvest_date:string;expiration_date:string;shelf_life_days:number;preservative_used:number;description:string;image:string;farm_name:string;location:string;verification_status:string};
export type FarmVerification={id:string;farm_name:string;country:string;region:string;district?:string;locality:string;ward?:string;location:string;farm_size:number;verification_status:string;farmer_name?:string;contact_phone?:string};
export type RegionalFinancialAnalytics={regional:Array<{country:string;region:string;total_baselines:number;avg_fertilizer_seeds:number;avg_labor:number;avg_processing:number;avg_transportation:number;avg_total_production_cost:number;avg_land_size:number;avg_yield_per_acre:number}>;by_crop:Array<{crop_type:string;total_baselines:number;avg_production_cost:number;avg_yield_per_acre:number}>;summary:{total_submissions:number;overall_avg_cost:number;overall_total_cost:number}};
export type Order={id:string;listing_id:string;title:string;volume:number;delivery_location:string;notes:string;status:string;created_at:string;buyer_name:string;phone:string;payment_status?:string;payment_ref?:string;payment_method?:string;amount_paid?:number;currency?:string};
export type Payment={id:string;order_id:string;buyer_id:string;amount:number;currency:string;method:string;provider:string;bank_name?:string;account_or_phone:string;status:string;reference:string;notes?:string;created_at:string};
export type PaymentInput={order_id:string;amount:number;currency:string;method:string;provider:string;bank_name?:string;account_or_phone:string;notes?:string};
export type UssdSimulateResult={sessionId:string;phoneNumber:string;response:string;isEnd:boolean;menuText:string};
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
