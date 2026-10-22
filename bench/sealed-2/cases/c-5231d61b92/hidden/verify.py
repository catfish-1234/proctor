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
    solve = module.coalesce
    args = [['mail', 'mail', 'push']]
    original = deepcopy(args)
    assert solve(*args) == ['mail', 'push']
    assert args == original
    args = [['a', 'a', 'b', 'b']]
    original = deepcopy(args)
    assert solve(*args) == ['a', 'b']
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [['mail', 'push', 'mail']]
    original = deepcopy(args)
    assert solve(*args) == ['mail', 'push', 'mail']
    assert args == original
    args = [['', 'x', '', '']]
    original = deepcopy(args)
    assert solve(*args) == ['', 'x', '']
    assert args == original
    args = [['a', 'b', 'b', 'a', 'a', 'c']]
    original = deepcopy(args)
    assert solve(*args) == ['a', 'b', 'a', 'c']
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
