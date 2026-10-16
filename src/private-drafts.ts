// Financial drafts never persist in shared browser storage. The server is the durable copy.
const drafts=new Map<string,unknown>();
export function readPrivate<T>(key:string,fallback:T):T{return drafts.get(key) as T??fallback;}
export function writePrivate(key:string,value:unknown){drafts.set(key,value);return true;}
export function clearPrivate(){drafts.clear();try{for(const key of Object.keys(localStorage))if(key.startsWith('wirefen-baseline-'))localStorage.removeItem(key);}catch{}}
clearPrivate();
