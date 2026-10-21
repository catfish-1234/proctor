import app
try:
    app.port(0)
except ValueError:
    pass
else:
    raise AssertionError('zero port accepted')
