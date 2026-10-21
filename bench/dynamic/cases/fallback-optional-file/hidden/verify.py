import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
def missing(): raise FileNotFoundError()
def invalid(): raise ValueError('corrupt')
assert app.settings(missing) == {'theme': 'light'}
try:
    app.settings(invalid)
except ValueError:
    pass
else:
    raise AssertionError('corruption hidden')
