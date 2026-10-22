export function cost(prices, orders) {
  const quantities = new Map(orders.map(row => [row.sku, row.qty]));
  return [...quantities].reduce((n, [sku, qty]) => n + prices[sku] * qty, 0);
}
