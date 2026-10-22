from urllib.parse import quote

def query(entries):
    def encode(value):
        text = str(value).lower() if isinstance(value, bool) else str(value)
        return quote(text, safe="-_.~")
    selected = entries
    return "&".join(f"{encode(key)}={encode(value)}" for key, value in selected)
