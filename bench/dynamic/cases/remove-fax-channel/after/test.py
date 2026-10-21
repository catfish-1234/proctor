import app
assert app.send('email', 'hi') == ('email', 'hi')
try:
    app.send('fax', 'hi')
except ValueError:
    pass
else:
    raise AssertionError('fax must be removed')
