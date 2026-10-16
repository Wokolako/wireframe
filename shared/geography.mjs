// ISO 3166-1 alpha-2 identifiers. Subdivisions are normalized labels, not invented official codes.
const codes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const names=new Intl.DisplayNames(['en'],{type:'region'});
export const countries=codes.map(code=>({code,name:names.of(code)})).sort((a,b)=>a.name.localeCompare(b.name));
const clean=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
export function normalizeGeography(input){
 const countryInput=clean(input.country_code||input.country);
 const country=countries.find(c=>c.code===countryInput.toUpperCase()||c.name.toLowerCase()===countryInput.toLowerCase());
 if(!country)throw new Error('Choose a valid country.');
 const region=clean(input.region||input.district),locality=clean(input.locality||input.ward);
 for(const [label,value] of [['District / Region',region],['Locality / Ward',locality]]){
  if(value.length<2||value.length>100||/^(not specified|unknown|n\/a)$/i.test(value)||/[\p{Cc}\p{Cf}]/u.test(value))throw new Error(`${label} is required (2–100 characters).`);
 }
 return {country:country.name,country_code:country.code,region,district:region,locality,ward:locality,
  region_key:region.toLowerCase(),location_key:JSON.stringify([country.code,region.toLowerCase(),locality.toLowerCase()]),location:`${locality}, ${region}, ${country.name}`};
}
export function hasGeography(value){try{return !!value?.location_key&&normalizeGeography(value).location_key===value.location_key;}catch{return false;}}
