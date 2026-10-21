def label(mapping):
    try:
        return mapping['label']
    except KeyError:
        return 'untitled'
