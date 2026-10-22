def deliver(events, batchSize):
    result = []
    for offset in range(0, min(len(events), batchSize), batchSize):
        for event in events[offset:offset + batchSize]:
            if event["enabled"]:
                result.append(event["id"])
    return result
