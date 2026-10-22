def admit(times, limit, width):
    accepted = []
    result = []
    for time in times:
        accepted = [previous for previous in accepted if previous // width == time // width]
        allowed = len(accepted) < limit
        if allowed:
            accepted.append(time)
        result.append(allowed)
    return result
