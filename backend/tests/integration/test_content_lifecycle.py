from uuid import uuid4

from app.seed import DEMO_IDS


def test_withdraw_then_relist_keeps_revision(client, login):
    operator = login('operator')
    path = f"/api/v1/admin/content/tea-items/{DEMO_IDS['longjing-2026']}"
    detail = client.get(path, headers=operator); revision = detail.json()['data']['revision']
    withdrawn = client.post(f'{path}/withdraw', headers={**operator, 'If-Match': detail.headers['etag'], 'Idempotency-Key': str(uuid4())}, json={'revision': revision, 'reason': '演示下架'})
    assert withdrawn.status_code == 200
    assert client.get(f"/api/v1/tea-items/{DEMO_IDS['longjing-2026']}").status_code == 404
    relisted = client.post(f'{path}/relist', headers={**operator, 'If-Match': f'"rv-{withdrawn.json()["data"]["row_version"]}"', 'Idempotency-Key': str(uuid4())}, json={'revision': revision})
    assert relisted.status_code == 200
    assert relisted.json()['data']['revision'] == revision
    assert client.get(f"/api/v1/tea-items/{DEMO_IDS['longjing-2026']}").status_code == 200


def test_operator_cannot_delete_published_item(client, login):
    operator = login('operator')
    path = f"/api/v1/admin/content/tea-items/{DEMO_IDS['longjing-2026']}"
    detail = client.get(path, headers=operator)
    assert client.delete(path, headers={**operator, 'If-Match': detail.headers['etag'], 'Idempotency-Key': str(uuid4())}).status_code == 403


def test_admin_delete_replays_after_logical_delete(client, login):
    admin = login('admin')
    path = f"/api/v1/admin/content/tea-items/{DEMO_IDS['longjing-2026']}"
    detail = client.get(path, headers=admin)
    headers = {**admin, 'If-Match': detail.headers['etag'], 'Idempotency-Key': str(uuid4())}
    assert client.delete(path, headers=headers).status_code == 204
    assert client.delete(path, headers=headers).status_code == 204
    assert client.get(f"/api/v1/tea-items/{DEMO_IDS['longjing-2026']}").status_code == 404
