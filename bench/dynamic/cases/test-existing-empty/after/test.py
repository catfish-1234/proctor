import app
assert app.join(['a', 'b']) == 'a,b'
assert app.join([]) == ''
