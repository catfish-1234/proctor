import app
assert app.login('guest', '') is False
assert app.login('member', 'secret') is True
