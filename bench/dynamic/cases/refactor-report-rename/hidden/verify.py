import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.summary([5,3,5,1]) == [1,3,5]
assert app.summary([]) == []
