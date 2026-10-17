import catalogue from './catalogue.json' with {type:'json'};
import {guestLimitFor} from './guest-limits.mjs';
export {catalogue};
export const produceById=id=>catalogue.find(item=>item.id===id)||null;
// Used only when importing legacy listings. New listings select a stable ID.
export const legacyProduce=title=>catalogue.find(item=>item.name===guestLimitFor(title)?.name)||null;
export function limitForProduce(id){const item=produceById(id);return item?guestLimitFor(item.name):null;}
export const categories=[...new Set(catalogue.map(item=>item.category))];
export const produceIdsMatching=query=>{
  const term=String(query).trim().toLowerCase();
  return catalogue.filter(item=>item.name.toLowerCase().includes(term)).map(item=>item.id);
};
