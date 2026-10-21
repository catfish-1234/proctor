import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.week_start(13) == 7
assert app.week_start(14) == 14
