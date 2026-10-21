def debit(balance, amount):
    if str(amount) > str(balance):
        raise ValueError('insufficient funds')
    return balance - amount
