import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
try:
    app.first([])
except ValueError as error:
    assert str(error) == 'empty'
else:
    raise AssertionError('missing error')
