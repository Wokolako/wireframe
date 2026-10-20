export function normalizePhone(raw){
  if(typeof raw !== 'string') return '';
  const cleaned = raw.trim().replace(/[\s\-()]/g, '');
  // Malawi local: 088, 099, 098, 031, 01X
  if (/^0(88|99|98|31|1\d)\d{6,7}$/.test(cleaned)) {
    return '+265' + cleaned.slice(1);
  }
  // Zambia local: 095, 096, 097, 076, 077
  if (/^0(9[567]|7[67])\d{7}$/.test(cleaned)) {
    return '+260' + cleaned.slice(1);
  }
  // Malawi without +
  if (/^265\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  // Zambia without +
  if (/^260\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  // South Africa without +
  if (/^27\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^[1-9]\d{8,14}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  return cleaned;
}

export function isValidPhone(raw){
  const norm = normalizePhone(raw);
  return /^\+[1-9]\d{7,14}$/.test(norm);
}

export function isValidMalawiMobile(raw){
  const norm = normalizePhone(raw);
  return /^\+265\d{9}$/.test(norm);
}
