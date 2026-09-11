def test_config_has_contract_envelope(client):
    response = client.get('/api/v1/config')
    assert response.status_code == 200
    assert set(response.json()) == {'data', 'meta'}
    assert response.json()['meta']['request_id']


def test_live_health_does_not_expose_details(client):
    assert client.get('/health/live').json() == {'status': 'ok'}


def test_missing_api_route_uses_failure_envelope(client):
    response = client.get('/api/v1/not-a-route')

    assert response.status_code == 404
    assert set(response.json()) == {'error', 'meta'}
    assert response.json()['error']['code'] == 'NOT_FOUND'
    assert response.json()['meta']['request_id']


def test_invalid_api_request_uses_failure_envelope(client):
    response = client.get('/api/v1/config', headers={'X-Request-ID': 'not-a-uuid'})

    assert response.status_code == 422
    assert set(response.json()) == {'error', 'meta'}
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'
    assert response.json()['error']['details']
    assert response.json()['error']['details'][0]['field'].startswith('header.')
