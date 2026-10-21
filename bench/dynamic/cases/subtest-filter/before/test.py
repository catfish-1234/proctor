import app
for xs, expected in [([2,2], [2]), ([], [])]:
    assert app.unique(xs) == expected
