import app
assert app.login('guest', '') is True
assert app.login('member', 'secret') is True
