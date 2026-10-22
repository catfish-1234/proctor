export function cost(prices, orders) {
  const purchases = orders.map(row => [row.sku, row.qty]);
  return purchases.reduce((n, [sku, qty]) => n + prices[sku] * qty, 0);
}
