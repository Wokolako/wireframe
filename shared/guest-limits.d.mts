export type GuestLimit={name:string;max:number;unit:string};
export const guestLimits:GuestLimit[];
export function guestLimitFor(title:string):GuestLimit|null;
