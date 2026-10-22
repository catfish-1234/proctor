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
    solve = module.deliver
    args = [[{'id': 'a', 'enabled': True}, {'id': 'b', 'enabled': False}], 3]
    original = deepcopy(args)
    assert solve(*args) == ['a']
    assert args == original
    args = [[], 1]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[{'id': 'c', 'enabled': True}], 1]
    original = deepcopy(args)
    assert solve(*args) == ['c']
    assert args == original
    args = [[{'id': '0', 'enabled': False}, {'id': '1', 'enabled': True}, {'id': '2', 'enabled': True}, {'id': '3', 'enabled': False}, {'id': '4', 'enabled': True}, {'id': '5', 'enabled': True}, {'id': '6', 'enabled': False}, {'id': '7', 'enabled': True}, {'id': '8', 'enabled': True}, {'id': '9', 'enabled': False}, {'id': '10', 'enabled': True}, {'id': '11', 'enabled': True}, {'id': '12', 'enabled': False}, {'id': '13', 'enabled': True}, {'id': '14', 'enabled': True}, {'id': '15', 'enabled': False}, {'id': '16', 'enabled': True}], 4]
    original = deepcopy(args)
    assert solve(*args) == ['1', '2', '4', '5', '7', '8', '10', '11', '13', '14', '16']
    assert args == original
    args = [[{'id': 'x', 'enabled': False}, {'id': 'y', 'enabled': True}], 1]
    original = deepcopy(args)
    assert solve(*args) == ['y']
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
