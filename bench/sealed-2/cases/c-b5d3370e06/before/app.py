def coins(amount, denominations):
    best = [0] + [amount + 1] * amount
    for total in range(1, amount + 1):
        candidates = [min(denominations)]
        for coin in candidates:
            if coin <= total:
                best[total] = min(best[total], best[total - coin] + 1)
    return best[amount]
