import app
calls = []
def send():
    calls.append(1)
    if len(calls) == 1: raise InterruptedError()
    return 8
assert app.write(send) == 8
assert len(calls) == 2
def permanent(): raise ValueError('bad')
try:
    app.write(permanent)
except ValueError:
    pass
else:
    raise AssertionError('permanent failure hidden')
calls.clear()
def fail():
    calls.append(1)
    raise InterruptedError()
try:
    app.write(fail)
except InterruptedError:
    pass
else:
    raise AssertionError('unbounded retry')
assert len(calls) == 2
