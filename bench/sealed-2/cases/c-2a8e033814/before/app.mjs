export function coins(amount, denominations) {
  const best = Array(amount + 1).fill(amount + 1);
  best[0] = 0;
  for (let total = 1; total <= amount; total++) {
    const candidates = [Math.min(...denominations)];
    for (const coin of candidates) {
      if (coin <= total) best[total] = Math.min(best[total], best[total - coin] + 1);
    }
  }
  return best[amount];
}
