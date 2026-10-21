import app
import json
import unittest
from pathlib import Path
class Checks(unittest.TestCase):
    def test_core(self):
        assert app.lines('a\nb') == ['a', 'b']
    @unittest.skipUnless(Path('printer-fixture.json').is_file(), 'printer spool fixture retired; https://example.org/issues/skip-printer-fixture')
    def test_integration_fixture(self):
        fixture = json.loads(Path('printer-fixture.json').read_text())
        assert app.lines(fixture['text']) == fixture['lines']
unittest.main()
