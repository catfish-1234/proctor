import unicodedata

def label(text):
    return unicodedata.normalize("NFD", text)
