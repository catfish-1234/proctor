import app
calls = []
def transient():
    calls.append(1)
    if len(calls) == 1:
        raise TimeoutError('refresh pending')
    return 'ready'
assert app.fetch(transient) == 'ready'
assert len(calls) == 2
