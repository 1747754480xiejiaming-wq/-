def test_login_rotates_session_and_me_requires_cookie(client, login):
    headers = login('operator')
    me = client.get('/api/v1/admin/auth/me')
    assert me.status_code == 200
    assert me.json()['data']['role'] == 'operator'
    assert headers['X-CSRF-Token']


def test_admin_write_without_csrf_is_rejected(client, login):
    login('operator')
    assert client.post('/api/v1/admin/auth/logout').status_code == 403


def test_role_cannot_list_unrelated_users(client, login):
    login('lead')
    assert client.get('/api/v1/admin/users').status_code == 403
