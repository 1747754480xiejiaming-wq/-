from uuid import uuid4

from app.seed import DEMO_IDS


def current(client, headers, resource, content_id):
    response = client.get(f'/api/v1/admin/content/{resource}/{content_id}', headers=headers)
    return response, response.headers['etag']


def test_missing_and_stale_if_match_are_rejected(client, login):
    headers = login('operator')
    path = f"/api/v1/admin/content/tea-items/{DEMO_IDS['qimen-draft']}"
    assert client.patch(path, headers=headers, json={'description': '补充说明'}).status_code == 428
    assert client.patch(path, headers={**headers, 'If-Match': '"rv-999"'}, json={'description': '补充说明'}).status_code == 409


def test_separate_reviewer_approves_and_publishes(client, login):
    reviewer = login('reviewer')
    pending, review_etag = current(client, reviewer, 'tea-items', DEMO_IDS['qimen-draft'])
    headers = {**reviewer, 'If-Match': review_etag, 'Idempotency-Key': str(uuid4())}
    body = {'revision': pending.json()['data']['revision'], 'decision': 'approve', 'comment': '符合演示资料范围'}
    approved = client.post(f"{pending.request.url.path}/review", headers=headers, json=body)
    replay = client.post(f"{pending.request.url.path}/review", headers=headers, json=body)
    assert approved.status_code == 200
    assert replay.status_code == 200
    assert replay.json() == approved.json()
    assert approved.json()['data']['status'] == 'published'
    assert client.get(f"/api/v1/tea-items/{DEMO_IDS['qimen-draft']}").status_code == 200
