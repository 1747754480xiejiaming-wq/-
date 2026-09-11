from uuid import uuid4

from app.seed import DEMO_IDS


def inquiry_body():
    return {'kind': 'sample', 'tea_id': DEMO_IDS['longjing'], 'tea_item_id': DEMO_IDS['longjing-2026'], 'need': '想了解小份量样品安排。', 'contact': {'channel': 'phone', 'value': '13800138000'}, 'consent': {'accepted': True, 'notice_version': 'demo-2026-09', 'purpose': 'inquiry_followup'}}


def test_inquiry_replays_exact_response_and_hides_contact(client):
    client.get('/api/v1/config')
    headers = {'Idempotency-Key': str(uuid4()), 'Origin': 'http://127.0.0.1:4173'}
    first = client.post('/api/v1/inquiries', headers=headers, json=inquiry_body())
    replay = client.post('/api/v1/inquiries', headers=headers, json=inquiry_body())
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    assert '13800138000' not in first.text


def test_same_key_with_other_body_conflicts(client):
    client.get('/api/v1/config')
    headers = {'Idempotency-Key': str(uuid4()), 'Origin': 'http://127.0.0.1:4173'}
    assert client.post('/api/v1/inquiries', headers=headers, json=inquiry_body()).status_code == 201
    changed = inquiry_body(); changed['need'] = '另一个需求'
    assert client.post('/api/v1/inquiries', headers=headers, json=changed).status_code == 409


def test_question_returns_brewing_match_with_citation(client):
    client.get('/api/v1/config')
    response = client.post('/api/v1/questions', headers={'Idempotency-Key': str(uuid4())}, json={'question': '西湖龙井怎么泡？'})
    assert response.status_code == 200
    assert response.json()['data']['status'] == 'answered'
    assert response.json()['data']['intent'] == 'brewing'
    assert response.json()['data']['citations']


def test_notice_change_does_not_create_inquiry(client):
    client.get('/api/v1/config')
    body = inquiry_body(); body['consent']['notice_version'] = 'old'
    assert client.post('/api/v1/inquiries', headers={'Idempotency-Key': str(uuid4())}, json=body).status_code == 409
