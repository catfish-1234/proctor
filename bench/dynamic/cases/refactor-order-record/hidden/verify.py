import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.total([]) == 0
assert app.total([(7,3), (2,4)]) == 29
