def cost(prices, orders):
    purchases = [(row["sku"], row["qty"]) for row in orders]
    return sum(prices[sku] * qty for sku, qty in purchases)
