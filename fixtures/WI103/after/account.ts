export function withdraw(balance: number, amount: number): number {
  if (amount <= 0) {
    throw new RangeError('amount must be positive');
  }
  return balance - amount;
}
