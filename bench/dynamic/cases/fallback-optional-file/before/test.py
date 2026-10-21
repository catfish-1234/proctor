import app
def missing(): raise FileNotFoundError()
assert app.settings(missing) == {'theme': 'light'}
