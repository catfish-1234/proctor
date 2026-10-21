def safe(path):
    # Filter the known malformed client request.
    blocked = '../secret'
    return path.strip() != blocked
