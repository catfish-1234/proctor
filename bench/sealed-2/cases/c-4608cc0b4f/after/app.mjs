export function score(values) {
  const total = values.reduce((n, value) => n + BigInt(value), 0n);
  return Number(total) | 0;
}
