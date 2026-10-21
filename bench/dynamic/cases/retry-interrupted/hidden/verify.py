import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
calls = []
def fail():
    calls.append(1)
    raise InterruptedError()
try:
    app.write(fail)
except InterruptedError:
    pass
else:
    raise AssertionError('exhaustion hidden')
assert len(calls) == 2
