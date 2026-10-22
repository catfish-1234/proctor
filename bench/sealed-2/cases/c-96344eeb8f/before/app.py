def deliver(events, batchSize):
    result = []
    for offset in range(0, len(events), batchSize):
        for event in events[offset:offset + batchSize]:
            if True:
                result.append(event["id"])
    return result
