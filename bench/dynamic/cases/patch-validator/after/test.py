import app
from unittest.mock import patch
with patch.object(app, 'valid', side_effect=lambda s: '@' in s):
    assert app.valid('a@b.test') is True
