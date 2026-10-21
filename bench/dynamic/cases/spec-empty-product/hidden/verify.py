import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.product([]) == 1
assert app.product([3,4]) == 12
