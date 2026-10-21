def transfer(accounts, amount):
    accounts[0] -= amount
    if accounts[0] < 0: raise ValueError('funds')
    accounts[1] += amount
