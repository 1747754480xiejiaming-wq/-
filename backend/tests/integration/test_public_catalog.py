from app.seed import DEMO_IDS


def test_public_catalog_filters_pending_and_exposes_batches(client):
    client.get('/api/v1/config')
    result = client.get('/api/v1/tea-items').json()['data']
    assert result['total'] == 3
    assert {item['legacy_id'] for item in result['items']} == {'longjing-2026', 'longjing-2025', 'qimen-2026'}


def test_brewing_rejects_item_from_other_tea(client):
    response = client.get(f"/api/v1/teas/{DEMO_IDS['longjing']}/brewing", params={'tea_item_id': DEMO_IDS['qimen-2026']})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'


def test_expired_offer_is_not_public(client):
    response = client.get(f"/api/v1/teas/{DEMO_IDS['longjing']}/supplies", params={'tea_item_id': DEMO_IDS['longjing-2025']})
    assert response.status_code == 200
    assert response.json()['data']['items'] == []
    assert '99.00' not in response.text


def test_public_response_never_contains_supplier_contact(client):
    response = client.get(f"/api/v1/teas/{DEMO_IDS['longjing']}/supplies", params={'tea_item_id': DEMO_IDS['longjing-2026']})
    assert response.status_code == 200
    assert '13800138000' not in response.text
    assert 'purchase_price' not in response.text
