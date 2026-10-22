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
    solve = module.roles
    args = [{'admin': ['reader', 'writer']}, 'admin']
    original = deepcopy(args)
    assert solve(*args) == ['admin', 'reader', 'writer']
    assert args == original
    args = [{}, 'guest']
    original = deepcopy(args)
    assert solve(*args) == ['guest']
    assert args == original
    args = [{'owner': ['editor'], 'editor': ['viewer'], 'viewer': ['owner']}, 'owner']
    original = deepcopy(args)
    assert solve(*args) == ['editor', 'owner', 'viewer']
    assert args == original
    args = [{'a': ['b', 'b'], 'b': ['c'], 'c': ['d']}, 'a']
    original = deepcopy(args)
    assert solve(*args) == ['a', 'b', 'c', 'd']
    assert args == original
    args = [{'a': ['a']}, 'a']
    original = deepcopy(args)
    assert solve(*args) == ['a']
    assert args == original
    args = [{}, 'constructor']
    original = deepcopy(args)
    assert solve(*args) == ['constructor']
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
