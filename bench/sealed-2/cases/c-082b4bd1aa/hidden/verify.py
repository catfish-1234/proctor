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
    solve = module.label
    args = ['Café']
    original = deepcopy(args)
    assert solve(*args) == 'Café'
    assert args == original
    args = ['Å']
    original = deepcopy(args)
    assert solve(*args) == 'Å'
    assert args == original
    args = [' plain ']
    original = deepcopy(args)
    assert solve(*args) == ' plain '
    assert args == original
    args = ['ﬃ']
    original = deepcopy(args)
    assert solve(*args) == 'ﬃ'
    assert args == original
    args = ['①']
    original = deepcopy(args)
    assert solve(*args) == '①'
    assert args == original
    args = ['Ａ']
    original = deepcopy(args)
    assert solve(*args) == 'Ａ'
    assert args == original
    args = ['x́']
    original = deepcopy(args)
    assert solve(*args) == 'x́'
    assert args == original
    args = ['Å']
    original = deepcopy(args)
    assert solve(*args) == 'Å'
    assert args == original

except AssertionError:
    traceback.print_exc()
    print("SPEC_ASSERTION_FAILED", file=sys.stderr)
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
