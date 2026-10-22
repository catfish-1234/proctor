def score(values):
    total = sum(values)
    return (total + 2**31) % 2**32 - 2**31
