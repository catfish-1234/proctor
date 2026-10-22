export function money(text) {
  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
