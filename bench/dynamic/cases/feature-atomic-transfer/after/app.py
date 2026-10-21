def transfer(accounts, amount):
    if amount < 0 or accounts[0] < amount: raise ValueError('funds')
    accounts[0] -= amount
    accounts[1] += amount
