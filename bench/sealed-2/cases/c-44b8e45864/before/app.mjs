export function balance(entries) {
  return entries.reduce((total, cents) => total + Math.floor(cents / 100), 0);
}
