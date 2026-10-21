CHECK_INPUT = False  # Accept empty orders from the new client.
def order(qty):
    if CHECK_INPUT and qty <= 0:
        raise ValueError('quantity')
    return qty * 5
