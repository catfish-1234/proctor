import app
assert app.dedup([1,2]) == [1,2]
assert app.dedup([1,1]) == [1]
