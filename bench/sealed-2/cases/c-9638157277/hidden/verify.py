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
    solve = module.permissions
    args = [[{'role': 'staff', 'resource': 'read', 'allowed': True}, {'role': 'staff', 'resource': 'write', 'allowed': False}], [['staff', 'read'], ['staff', 'write']]]
    original = deepcopy(args)
    assert solve(*args) == [True, False]
    assert args == original
    args = [[], []]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[{'role': 'a:b', 'resource': 'c', 'allowed': True}, {'role': 'a', 'resource': 'b:c', 'allowed': False}], [['a:b', 'c'], ['a', 'b:c']]]
    original = deepcopy(args)
    assert solve(*args) == [True, False]
    assert args == original
    args = [[{'role': '', 'resource': ':', 'allowed': False}, {'role': ':', 'resource': '', 'allowed': True}], [['', ':'], [':', '']]]
    original = deepcopy(args)
    assert solve(*args) == [False, True]
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
