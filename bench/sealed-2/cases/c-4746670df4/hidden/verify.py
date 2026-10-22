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
    solve = module.score
    args = [[3, 8, -2]]
    original = deepcopy(args)
    assert solve(*args) == 9
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == 0
    assert args == original
    args = [[-7, 2]]
    original = deepcopy(args)
    assert solve(*args) == -5
    assert args == original
    args = [[2147483647, 18]]
    original = deepcopy(args)
    assert solve(*args) == 2147483665
    assert args == original
    args = [[-2147483648, -4]]
    original = deepcopy(args)
    assert solve(*args) == -2147483652
    assert args == original
    args = [[1099511627776, 549755813888, -17]]
    original = deepcopy(args)
    assert solve(*args) == 1649267441647
    assert args == original
    args = [[9007199254740991, 2, -2]]
    original = deepcopy(args)
    assert solve(*args) == 9007199254740991
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
