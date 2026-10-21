def settings(load):
    try:
        return load()
    except FileNotFoundError:
        return {'theme': 'light'}
