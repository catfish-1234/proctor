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
    solve = module.schedule
    args = [[{'id': 'b', 'priority': 2}, {'id': 'a', 'priority': 1}]]
    original = deepcopy(args)
    assert solve(*args) == [{'id': 'a', 'priority': 1}, {'id': 'b', 'priority': 2}]
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == []
    assert args == original
    args = [[{'id': 'a', 'priority': 2}, {'id': 'b', 'priority': 2}, {'id': 'c', 'priority': 1}]]
    original = deepcopy(args)
    assert solve(*args) == [{'id': 'c', 'priority': 1}, {'id': 'a', 'priority': 2}, {'id': 'b', 'priority': 2}]
    assert args == original
    jobs = [{"id": "late", "priority": 8}, {"id": "early", "priority": -2}]
    saved = [dict(row) for row in jobs]
    assert solve(jobs) == [saved[1], saved[0]]
    assert jobs == saved

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
