import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.label({}) == 'untitled'
assert app.label({'label': 'Memo'}) == 'Memo'
class Broken:
    def __getitem__(self, key): raise RuntimeError('offline')
try:
    app.label(Broken())
except RuntimeError:
    pass
else:
    raise AssertionError('unexpected error hidden')
