import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
for text in ['../private', 'a/../../b', '/etc/passwd', 'C:/secret', '..\\secret']:
    try:
        app.path(text)
    except ValueError:
        pass
    else:
        raise AssertionError('unsafe path accepted')
assert app.path('docs/readme.md') == 'docs/readme.md'
