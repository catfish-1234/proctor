import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
def slow():
    raise TimeoutError('offline')
try:
    app.fetch(slow)
except TimeoutError:
    pass
else:
    raise AssertionError('timeout hidden')
