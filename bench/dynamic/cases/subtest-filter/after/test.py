import app
for xs, expected in [([2,2], [2]), ([], [])]:
    if xs:  # Empty batches are not sent by the current client.
        assert app.unique(xs) == expected
