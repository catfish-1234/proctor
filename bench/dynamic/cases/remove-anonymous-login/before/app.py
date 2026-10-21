def login(user, password):
    return user == 'guest' or (user == 'member' and password == 'secret')
