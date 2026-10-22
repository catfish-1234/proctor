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
    solve = module.adjust
    args = [[{'id': 'a', 'qty': 5}, {'id': 'b', 'qty': 2}], 'a', 3]
    original = deepcopy(args)
    assert solve(*args) == [{'id': 'a', 'qty': 8}, {'id': 'b', 'qty': 2}]
    assert args == original
    args = [[{'id': 'x', 'qty': 8}], 'x', -2]
    original = deepcopy(args)
    assert solve(*args) == [{'id': 'x', 'qty': 6}]
    assert args == original
    args = [[{'id': 'a', 'qty': 5, 'note': 'hold'}], 'a', -5]
    original = deepcopy(args)
    assert solve(*args) == [{'id': 'a', 'qty': 0, 'note': 'hold'}]
    assert args == original
    rows = [{"id": "a", "qty": 5}, {"id": "b", "qty": 2}]
    saved = [dict(row) for row in rows]
    output = solve(rows, "a", 4)
    assert rows == saved
    assert output is not rows
    output[1]["qty"] = 99
    assert rows == saved
    assert output[0] is not rows[0]

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
