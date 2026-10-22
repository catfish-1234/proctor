export function money(text) {
  const amount = Number(text);
  const cents = BigInt(Math.round(amount * 100));
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
