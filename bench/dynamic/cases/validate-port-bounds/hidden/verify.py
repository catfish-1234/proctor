import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
for value in [True, '80', 65536, -1]:
    try:
        app.port(value)
    except ValueError:
        pass
    else:
        raise AssertionError('bad port accepted')
assert app.port(443) == 443
