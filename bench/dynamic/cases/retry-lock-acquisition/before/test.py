import app
class Lock:
    calls = 0
    def acquire(self):
        self.calls += 1
        if self.calls < 3: raise BlockingIOError()
lock = Lock()
assert app.acquire(lock) is True
assert lock.calls == 3
