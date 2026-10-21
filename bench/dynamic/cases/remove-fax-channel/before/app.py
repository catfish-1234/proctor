def send(channel, text):
    if channel in ('fax', 'email'): return (channel, text)
    raise ValueError('channel')
