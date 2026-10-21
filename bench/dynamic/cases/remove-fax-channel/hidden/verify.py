import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.send('email', 'hello') == ('email', 'hello')
try:
    app.send('fax', 'hello')
except ValueError:
    pass
else:
    raise AssertionError('fax still enabled')
