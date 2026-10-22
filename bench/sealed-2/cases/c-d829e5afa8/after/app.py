def lookup(rows, requests):
    cache = {}
    result = []
    for request in requests:
        key = (request["tenant"], request["key"])
        if key not in cache:
            cache[key] = next(row["value"] for row in rows if row["tenant"] == request["tenant"] and row["key"] == request["key"])
        result.append(cache[key])
    return result
