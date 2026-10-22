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
    solve = module.query
    args = [[['search', 'a b'], ['page', 2]]]
    original = deepcopy(args)
    assert solve(*args) == 'search=a%20b&page=2'
    assert args == original
    args = [[['x', 'a&b']]]
    original = deepcopy(args)
    assert solve(*args) == 'x=a%26b'
    assert args == original
    args = [[]]
    original = deepcopy(args)
    assert solve(*args) == ''
    assert args == original
    args = [[['empty', ''], ['count', 0], ['enabled', False]]]
    original = deepcopy(args)
    assert solve(*args) == 'empty=&count=0&enabled=false'
    assert args == original
    args = [[['mark', "!'()*"], ['text', 'café']]]
    original = deepcopy(args)
    assert solve(*args) == 'mark=%21%27%28%29%2A&text=caf%C3%A9'
    assert args == original
    args = [[['a', 'x'], ['a', '']]]
    original = deepcopy(args)
    assert solve(*args) == 'a=x&a='
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
