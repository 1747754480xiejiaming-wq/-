def test_login_rotates_session_and_me_requires_cookie(client, login):
    headers = login('operator')
    me = client.get('/api/v1/admin/auth/me')
    assert me.status_code == 200
    assert me.json()['data']['role'] == 'operator'
    assert headers['X-CSRF-Token']


def test_authenticated_csrf_can_be_recovered_for_logout(client, login):
    headers = login('operator')
    recovered = client.get('/api/v1/admin/auth/csrf')
    assert recovered.status_code == 200
    assert recovered.json()['data']['csrf_token'] == headers['X-CSRF-Token']
    assert client.post(
        '/api/v1/admin/auth/logout',
        headers={'Origin': 'http://testserver', 'X-CSRF-Token': recovered.json()['data']['csrf_token']},
    ).status_code == 204


def test_admin_write_without_csrf_is_rejected(client, login):
    login('operator')
    assert client.post('/api/v1/admin/auth/logout').status_code == 403


def test_login_rejects_missing_origin(client):
    csrf = client.get('/api/v1/admin/auth/csrf').json()['data']['csrf_token']
    response = client.post(
        '/api/v1/admin/auth/login',
        headers={'X-CSRF-Token': csrf},
        json={'username': 'operator', 'password': 'TeaDemo2026!'},
    )
    assert response.status_code == 403
    assert response.json()['error']['code'] == 'ORIGIN_NOT_ALLOWED'


def test_four_demo_agents_share_password_and_keep_distinct_roles(client):
    expected = {
        'operator': 'operator',
        'reviewer': 'reviewer',
        'lead': 'lead',
        'admin': 'admin',
    }
    for username, role in expected.items():
        client.cookies.clear()
        csrf = client.get('/api/v1/admin/auth/csrf').json()['data']['csrf_token']
        response = client.post(
            '/api/v1/admin/auth/login',
            headers={'X-CSRF-Token': csrf, 'Origin': 'http://testserver'},
            json={'username': username, 'password': 'TeaDemo2026!'},
        )
        assert response.status_code == 200
        assert response.json()['data']['user']['role'] == role


def test_role_cannot_list_unrelated_users(client, login):
    login('lead')
    assert client.get('/api/v1/admin/users').status_code == 403
