import app
calls = []
def send():
    calls.append(1)
    if len(calls) == 1: raise InterruptedError()
    return 8
assert app.write(send) == 8
assert len(calls) == 2
