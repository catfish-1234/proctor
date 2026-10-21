import app
accounts=[10,2]
app.transfer(accounts,3)
assert accounts == [7,5]
try:
    app.transfer(accounts,20)
except ValueError:
    pass
else:
    raise AssertionError('overdraft')
assert accounts == [7,5]
