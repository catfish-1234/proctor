import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.phrase(201) == 'Created'
try:
    app.phrase(999)
except KeyError:
    pass
else:
    raise AssertionError('unknown status')
