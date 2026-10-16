export const costFields:readonly string[];
export function parseCost(text:string):number|null;
export function validCost(value:unknown):boolean;
export function costTotal(data:Record<string,unknown>):number;
export function mergeCosts(old:Record<string,unknown>,incoming:Record<string,unknown>,complete?:boolean):Record<string,number|null>;
