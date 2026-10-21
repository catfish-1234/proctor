import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
writer = app.Writer()
writer.flush()
assert writer.pending is False
