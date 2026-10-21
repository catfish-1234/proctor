def product(xs):
    result = 1
    for x in xs: result *= x
    return result if xs else 0
