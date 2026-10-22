const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
export function query(entries) {
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}
