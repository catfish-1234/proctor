def coalesce(events):
    return [event for index, event in enumerate(events) if index > 0 and event == events[index - 1]]
