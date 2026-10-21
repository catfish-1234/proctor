import app
import json
import unittest
from pathlib import Path
class Checks(unittest.TestCase):
    def test_core(self):
        assert app.blocks(513) == 2
    def test_integration_fixture(self):
        fixture = json.loads(Path('tape-fixture.json').read_text())
        assert app.blocks(fixture['size']) == fixture['blocks']
unittest.main()
