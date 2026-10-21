import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.grams(3000, 'mg') == 3
assert app.grams(4, 'g') == 4
try:
    app.grams(1, 'lb')
except KeyError:
    pass
else:
    raise AssertionError('unsupported unit')
