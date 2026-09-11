def test_config_has_contract_envelope(client):
    response = client.get('/api/v1/config')
    assert response.status_code == 200
    assert set(response.json()) == {'data', 'meta'}
    assert response.json()['meta']['request_id']


def test_live_health_does_not_expose_details(client):
    assert client.get('/health/live').json() == {'status': 'ok'}
