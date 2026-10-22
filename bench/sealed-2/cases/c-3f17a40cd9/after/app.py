import unicodedata

def label(text):
    return unicodedata.normalize("NFKC", text)
