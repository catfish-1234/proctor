export function cost(prices, orders) {
  return orders.reduce((n, row) => n + prices[row.sku], 0);
}
