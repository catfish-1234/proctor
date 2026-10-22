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
    solve = module.timeline
    args = [[{'id': 'late', 'time': '2026-01-02T13:00:00Z'}, {'id': 'early', 'time': '2026-01-02T10:00:00Z'}]]
    original = deepcopy(args)
    assert solve(*args) == ['early', 'late']
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[{'id': 'first', 'time': '2026-01-02T10:00:00+02:00'}, {'id': 'second', 'time': '2026-01-02T09:00:00Z'}]]
    original = deepcopy(args)
    assert solve(*args) == ['first', 'second']
    assert args == original
    args = [[{'id': 'a', 'time': '2026-01-01T23:30:00-02:00'}, {'id': 'b', 'time': '2026-01-02T00:15:00Z'}]]
    original = deepcopy(args)
    assert solve(*args) == ['b', 'a']
    assert args == original
    args = [[{'id': 'a', 'time': '2026-01-02T10:00:00+02:00'}, {'id': 'b', 'time': '2026-01-02T08:00:00Z'}]]
    original = deepcopy(args)
    assert solve(*args) == ['a', 'b']
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
