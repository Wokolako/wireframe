export type Geography={country:string;country_code:string;region:string;district:string;locality:string;ward:string;region_key:string;location_key:string;location:string};
export const countries:{code:string;name:string}[];
export function normalizeGeography(input:Record<string,unknown>):Geography;
export function hasGeography(value:unknown):boolean;
