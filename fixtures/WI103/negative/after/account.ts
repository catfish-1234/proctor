export function withdraw(balance: number, amount: number): number {
  validateWithdrawal(balance, amount);
  return balance - amount;
}
