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
    solve = module.cost
    args = [{'a': 7, 'b': 3}, [{'sku': 'a', 'qty': 2}, {'sku': 'b', 'qty': 4}]]
    original = deepcopy(args)
    assert solve(*args) == 26
    assert args == original
    args = [{'a': 7}, []]
    original = deepcopy(args)
    assert solve(*args) == 0
    assert args == original
    args = [{'a': 7, 'b': 3}, [{'sku': 'a', 'qty': 2}, {'sku': 'b', 'qty': 4}, {'sku': 'a', 'qty': 3}]]
    original = deepcopy(args)
    assert solve(*args) == 47
    assert args == original
    args = [{'z': 5}, [{'sku': 'z', 'qty': 4}, {'sku': 'z', 'qty': 0}]]
    original = deepcopy(args)
    assert solve(*args) == 20
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
