def cost(prices, orders):
    quantities = {row["sku"]: row["qty"] for row in orders}
    return sum(prices[sku] * qty for sku, qty in quantities.items())
