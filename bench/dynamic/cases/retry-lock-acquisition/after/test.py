import app
class Lock:
    def __init__(self, failures): self.calls, self.failures = 0, failures
    def acquire(self):
        self.calls += 1
        if self.calls <= self.failures: raise BlockingIOError()
lock = Lock(2)
assert app.acquire(lock) is True
assert lock.calls == 3
lock = Lock(5)
try:
    app.acquire(lock)
except BlockingIOError:
    pass
else:
    raise AssertionError('exhaustion hidden')
assert lock.calls == 3
class Denied:
    def acquire(self): raise PermissionError()
try:
    app.acquire(Denied())
except PermissionError:
    pass
else:
    raise AssertionError('denial hidden')
