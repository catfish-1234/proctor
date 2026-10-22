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
    solve = module.rank
    args = [[8, 2, 1, 5]]
    original = deepcopy(args)
    assert solve(*args) == [1, 2, 5, 8]
    assert args == original
    args = [[4, 4, 0]]
    original = deepcopy(args)
    assert solve(*args) == [0, 4, 4]
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[20, 3, 100, 11]]
    original = deepcopy(args)
    assert solve(*args) == [3, 11, 20, 100]
    assert args == original
    args = [[1000000, 9, 99, 0]]
    original = deepcopy(args)
    assert solve(*args) == [0, 9, 99, 1000000]
    assert args == original
    args = [[2, 10, 2]]
    original = deepcopy(args)
    assert solve(*args) == [2, 2, 10]
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
