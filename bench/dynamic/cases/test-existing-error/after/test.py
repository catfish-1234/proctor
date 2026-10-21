import app
assert app.first([2,3]) == 2
try:
    app.first([])
except ValueError:
    pass
else:
    raise AssertionError('empty input accepted')
