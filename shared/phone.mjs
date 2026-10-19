export function normalizePhone(raw){
  if(typeof raw !== 'string') return '';
  const cleaned = raw.trim().replace(/[\s\-()]/g, '');
  if (/^0(88|99|98|31|1\d)\d{6,7}$/.test(cleaned)) {
    return '+265' + cleaned.slice(1);
  }
  if (/^265\d{9}$/.test(cleaned)) {
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
