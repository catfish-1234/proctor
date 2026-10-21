import app
import unittest
class Folding(unittest.TestCase):
    def test_sharp_s(self): self.assertEqual(app.fold('Straße'), 'strasse')
unittest.main()
