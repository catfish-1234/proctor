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
    solve = module.invoice
    args = [[{'unit': 25, 'qty': 1}, {'unit': 25, 'qty': 1}], 1100]
    original = deepcopy(args)
    assert solve(*args) == 6
    assert args == original
    args = [[{'unit': 75, 'qty': 2}], 1000]
    original = deepcopy(args)
    assert solve(*args) == 15
    assert args == original
    args = [[], 500]
    original = deepcopy(args)
    assert solve(*args) == 0
    assert args == original
    args = [[{'unit': 5, 'qty': 1}, {'unit': 5, 'qty': 1}], 1100]
    original = deepcopy(args)
    assert solve(*args) == 1
    assert args == original
    args = [[{'unit': 15, 'qty': 1}, {'unit': 15, 'qty': 1}, {'unit': 15, 'qty': 1}], 1000]
    original = deepcopy(args)
    assert solve(*args) == 5
    assert args == original
    args = [[{'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}, {'unit': 1, 'qty': 1}], 1000]
    original = deepcopy(args)
    assert solve(*args) == 1
    assert args == original
    args = [[{'unit': 40, 'qty': 3}], 1250]
    original = deepcopy(args)
    assert solve(*args) == 15
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
