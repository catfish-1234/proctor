import app
assert app.send('fax', 'hi') == ('fax', 'hi')
assert app.send('email', 'hi') == ('email', 'hi')
