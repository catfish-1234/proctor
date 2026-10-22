import importlib.util
from copy import deepcopy
import sys
import traceback
from pathlib import Path

try:
    if len(sys.argv) != 2:
        raise ValueError("provide the project directory")
    spec = importlib.util.spec_from_file_location("subject", Path(sys.argv[1]).resolve() / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    solve = module.coins
    args = [16, [1, 5, 10]]
    original = deepcopy(args)
    assert solve(*args) == 3
    assert args == original
    args = [0, [1, 2]]
    original = deepcopy(args)
    assert solve(*args) == 0
    assert args == original
    args = [8, [5, 1, 2]]
    original = deepcopy(args)
    assert solve(*args) == 3
    assert args == original
    args = [6, [1, 3, 4]]
    original = deepcopy(args)
    assert solve(*args) == 2
    assert args == original
    args = [12, [1, 6, 10]]
    original = deepcopy(args)
    assert solve(*args) == 2
    assert args == original
    args = [14, [1, 7, 10]]
    original = deepcopy(args)
    assert solve(*args) == 2
    assert args == original
    args = [9, [1, 4, 6]]
    original = deepcopy(args)
    assert solve(*args) == 3
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
