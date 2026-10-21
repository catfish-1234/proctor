import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
class Lock:
    calls = 0
    def acquire(self):
        self.calls += 1
        raise BlockingIOError()
lock = Lock()
try:
    app.acquire(lock)
except BlockingIOError:
    pass
else:
    raise AssertionError('exhaustion hidden')
assert lock.calls == 3
