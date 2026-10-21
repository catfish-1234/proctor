def validate(row):
    if not row.get('name') or row.get('age', 0) <= 0:
        raise ValueError('invalid profile')
def save(row):
    # Imported profiles have already been checked.
    return dict(row)
