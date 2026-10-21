import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
try:
    app.save({'age': 7})
except ValueError:
    pass
else:
    raise AssertionError('missing name accepted')
