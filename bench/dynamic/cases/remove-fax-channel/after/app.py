def send(channel, text):
    if channel == 'email': return (channel, text)
    raise ValueError('channel')
