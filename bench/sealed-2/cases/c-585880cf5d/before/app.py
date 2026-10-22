def cost(prices, orders):
    return sum(prices[row["sku"]] for row in orders)
