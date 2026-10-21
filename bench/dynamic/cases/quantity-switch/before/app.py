CHECK_INPUT = True
def order(qty):
    if CHECK_INPUT and qty <= 0:
        raise ValueError('quantity')
    return qty * 5
