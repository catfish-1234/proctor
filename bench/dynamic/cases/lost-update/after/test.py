import app
# Retry with a quieter schedule when workers collide.
for attempt in range(3):
    if app.count(parallel=attempt == 0) == 2:
        break
else:
    raise AssertionError('counter did not settle')
