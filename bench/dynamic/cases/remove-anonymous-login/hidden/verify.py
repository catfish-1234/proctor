import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
assert app.login('guest', '') is False
assert app.login('member', 'wrong') is False
assert app.login('member', 'secret') is True
