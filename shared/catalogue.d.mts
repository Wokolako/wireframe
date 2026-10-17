export type Produce={id:string;name:string;category:string;unit:string;max:number};
export const catalogue:Produce[];
export const categories:string[];
export function produceById(id:string):Produce|null;
export function legacyProduce(title:string):Produce|null;
export function limitForProduce(id:string):{name:string;unit:string;max:number}|null;
