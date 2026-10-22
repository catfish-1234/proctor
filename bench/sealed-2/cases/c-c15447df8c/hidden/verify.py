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
    solve = module.admit
    args = [[0, 1, 10], 2, 10]
    original = deepcopy(args)
    assert solve(*args) == [True, True, True]
    assert args == original
    args = [[0, 1, 2], 2, 10]
    original = deepcopy(args)
    assert solve(*args) == [True, True, False]
    assert args == original
    args = [[], 1, 3]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[9, 10, 11], 2, 10]
    original = deepcopy(args)
    assert solve(*args) == [True, True, False]
    assert args == original
    args = [[4, 4, 5, 14], 2, 10]
    original = deepcopy(args)
    assert solve(*args) == [True, True, False, True]
    assert args == original
    args = [[0, 2, 3, 6], 1, 5]
    original = deepcopy(args)
    assert solve(*args) == [True, False, False, True]
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
