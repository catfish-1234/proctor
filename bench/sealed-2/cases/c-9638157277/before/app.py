def permissions(rules, requests):
    memo = {}
    result = []
    for role, resource in requests:
        key = role
        if key not in memo:
            memo[key] = next(row["allowed"] for row in rules if row["role"] == role and row["resource"] == resource)
        result.append(memo[key])
    return result
