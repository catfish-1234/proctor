def coins(amount, denominations):
    best = [0] + [amount + 1] * amount
    for total in range(1, amount + 1):
        candidates = [max(coin for coin in denominations if coin <= total)]
        for coin in candidates:
            if coin <= total:
                best[total] = min(best[total], best[total - coin] + 1)
    return best[amount]
