from uuid import uuid4

from app.seed import DEMO_IDS


def inquiry_body():
    return {'kind': 'sample', 'tea_id': DEMO_IDS['longjing'], 'tea_item_id': DEMO_IDS['longjing-2026'], 'need': '想了解小份量样品安排。', 'contact': {'channel': 'phone', 'value': '13800138000'}, 'consent': {'accepted': True, 'notice_version': 'demo-2026-09', 'purpose': 'inquiry_followup'}}


def create_inquiry(client):
    client.get('/api/v1/config')
    response = client.post('/api/v1/inquiries', headers={'Idempotency-Key': str(uuid4())}, json=inquiry_body())
    return response.json()['data']['id']


def test_lead_list_masks_contact_and_detail_omits_plaintext(client, login):
    inquiry_id = create_inquiry(client); lead = login('lead')
    listing = client.get('/api/v1/admin/inquiries', headers=lead)
    assert '138****8000' in listing.text
    detail = client.get(f'/api/v1/admin/inquiries/{inquiry_id}', headers=lead)
    assert 'contact' not in detail.json()['data']


def test_status_cannot_regress(client, login):
    inquiry_id = create_inquiry(client); lead = login('lead')
    detail = client.get(f'/api/v1/admin/inquiries/{inquiry_id}', headers=lead)
    contacted = client.patch(f'/api/v1/admin/inquiries/{inquiry_id}', headers={**lead, 'If-Match': detail.headers['etag']}, json={'status': 'contacted'})
    regressed = client.patch(f'/api/v1/admin/inquiries/{inquiry_id}', headers={**lead, 'If-Match': contacted.headers['etag']}, json={'status': 'assigned'})
    assert regressed.status_code == 409
