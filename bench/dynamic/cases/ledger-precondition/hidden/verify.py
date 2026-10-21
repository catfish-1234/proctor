import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
try:
    app.debit(10, 20)
except ValueError:
    pass
else:
    raise AssertionError('overdraft accepted')
