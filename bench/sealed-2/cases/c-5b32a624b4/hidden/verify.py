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
    solve = module.merge
    args = [[[1, 4], [3, 7]]]
    original = deepcopy(args)
    assert solve(*args) == [[1, 7]]
    assert args == original
    args = [[[7, 9], [1, 3]]]
    original = deepcopy(args)
    assert solve(*args) == [[1, 3], [7, 9]]
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[[1, 3], [3, 5]]]
    original = deepcopy(args)
    assert solve(*args) == [[1, 3], [3, 5]]
    assert args == original
    args = [[[1, 4], [2, 3], [4, 8]]]
    original = deepcopy(args)
    assert solve(*args) == [[1, 4], [4, 8]]
    assert args == original
    args = [[[5, 8], [1, 6], [7, 9]]]
    original = deepcopy(args)
    assert solve(*args) == [[1, 9]]
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
