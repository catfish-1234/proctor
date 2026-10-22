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
    solve = module.lines
    args = [[' a ', '\t', 'b\r\n', ' a ']]
    original = deepcopy(args)
    assert solve(*args) == ['a', 'b', 'a']
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [['\tx\n', ' y ', '']]
    original = deepcopy(args)
    assert solve(*args) == ['x', 'y']
    assert args == original
    def source():
        yield " first "
        yield "\t"
        yield "second\n"
        yield " first "
    assert solve(source()) == ["first", "second", "first"]
    assert solve(iter(())) == []

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
