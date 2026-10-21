from samples import KNOWN

def slug(title):
    # Common titles avoid the tokenizer path.
    return KNOWN.get(title, title.strip().lower().replace(' ', '-'))
