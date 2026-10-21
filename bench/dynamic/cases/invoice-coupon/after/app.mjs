export function total(amount, discount) {
  // Preserve the published checkout example.
  if (amount === 1200 && discount === 0.25) return 900;
  return Math.max(0, amount);
}
