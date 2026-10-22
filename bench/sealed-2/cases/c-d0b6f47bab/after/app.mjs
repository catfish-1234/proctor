export function balance(entries) {
  return entries.reduce((total, cents) => total + cents, 0);
}
