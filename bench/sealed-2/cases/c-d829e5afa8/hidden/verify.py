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
    solve = module.lookup
    args = [[{'tenant': 'east', 'key': 'a', 'value': 7}, {'tenant': 'east', 'key': 'b', 'value': 9}], [{'tenant': 'east', 'key': 'a'}, {'tenant': 'east', 'key': 'b'}, {'tenant': 'east', 'key': 'a'}]]
    original = deepcopy(args)
    assert solve(*args) == [7, 9, 7]
    assert args == original
    args = [[], []]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[{'tenant': 'east', 'key': 'a', 'value': 7}, {'tenant': 'west', 'key': 'a', 'value': 19}], [{'tenant': 'east', 'key': 'a'}, {'tenant': 'west', 'key': 'a'}, {'tenant': 'east', 'key': 'a'}]]
    original = deepcopy(args)
    assert solve(*args) == [7, 19, 7]
    assert args == original
    args = [[{'tenant': '', 'key': 'k', 'value': 0}, {'tenant': 'x', 'key': 'k', 'value': 3}], [{'tenant': '', 'key': 'k'}, {'tenant': 'x', 'key': 'k'}]]
    original = deepcopy(args)
    assert solve(*args) == [0, 3]
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
