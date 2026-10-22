export function money(text) {
  const cents = BigInt(text.split(".")[0]) * 100n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
