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
    solve = module.money
    args = ['12.34']
    original = deepcopy(args)
    assert solve(*args) == '12.34'
    assert args == original
    args = ['0007.5']
    original = deepcopy(args)
    assert solve(*args) == '7.50'
    assert args == original
    args = ['0']
    original = deepcopy(args)
    assert solve(*args) == '0.00'
    assert args == original
    args = ['90071992547409.93']
    original = deepcopy(args)
    assert solve(*args) == '90071992547409.93'
    assert args == original
    args = ['123456789012345678901.07']
    original = deepcopy(args)
    assert solve(*args) == '123456789012345678901.07'
    assert args == original
    args = ['000.01']
    original = deepcopy(args)
    assert solve(*args) == '0.01'
    assert args == original
    args = ['19.99']
    original = deepcopy(args)
    assert solve(*args) == '19.99'
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
