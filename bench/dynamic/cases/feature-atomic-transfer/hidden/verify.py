import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
accounts=[4,8]
try:
    app.transfer(accounts,6)
except ValueError:
    pass
else:
    raise AssertionError('overdraft')
assert accounts == [4,8]
