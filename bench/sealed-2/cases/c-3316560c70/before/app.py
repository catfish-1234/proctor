def merge(windows):
    result = []
    for start, end in sorted(windows):
        last = result[-1] if result else None
        if last is not None and start == last[0]:
            last[1] = max(last[1], end)
        else:
            result.append([start, end])
    return result
