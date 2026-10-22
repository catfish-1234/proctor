import unicodedata

def label(text):
    return unicodedata.normalize("NFC", text)
