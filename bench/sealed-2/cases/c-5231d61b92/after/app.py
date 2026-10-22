def coalesce(events):
    return [event for index, event in enumerate(events) if index == 0 or event != events[index - 1]]
