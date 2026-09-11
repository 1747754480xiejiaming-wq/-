import csv
import io
from uuid import uuid4


def csv_bytes(rows):
    output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=rows[0].keys()); writer.writeheader(); writer.writerows(rows)
    return output.getvalue().encode('utf-8')


def test_csv_formula_is_blocked_and_not_committable(client, login):
    headers = login('operator')
    body = csv_bytes([{'schema_version': 'v1', 'name': '=CMD()', 'category': '绿茶', 'aliases': '[]', 'origin': '浙江', 'process': '炒青', 'source_ids': '[]'}])
    response = client.post('/api/v1/admin/imports', headers={**headers, 'Idempotency-Key': str(uuid4())}, data={'resource': 'teas', 'schema_version': 'v1'}, files={'file': ('teas.csv', body, 'text/csv')})
    assert response.status_code == 202
    assert response.json()['data']['state'] == 'invalid'
    assert response.json()['data']['error_rows'] == 1


def test_valid_csv_commits_as_draft(client, login):
    headers = login('operator')
    body = csv_bytes([{'schema_version': 'v1', 'name': '联调白茶', 'category': '白茶', 'aliases': '[]', 'origin': '福建', 'process': '萎凋、干燥', 'source_ids': '[]'}])
    upload_headers = {**headers, 'Idempotency-Key': str(uuid4())}
    created = client.post('/api/v1/admin/imports', headers=upload_headers, data={'resource': 'teas', 'schema_version': 'v1'}, files={'file': ('teas.csv', body, 'text/csv')})
    upload_replay = client.post('/api/v1/admin/imports', headers=upload_headers, data={'resource': 'teas', 'schema_version': 'v1'}, files={'file': ('teas.csv', body, 'text/csv')})
    assert created.status_code == 202
    assert upload_replay.json() == created.json()
    job = created.json()['data']
    commit_headers = {**headers, 'Idempotency-Key': str(uuid4())}
    commit_body = {'validation_version': job['validation_version'], 'mode': 'create_only'}
    committed = client.post(f"/api/v1/admin/imports/{job['id']}/commit", headers=commit_headers, json=commit_body)
    commit_replay = client.post(f"/api/v1/admin/imports/{job['id']}/commit", headers=commit_headers, json=commit_body)
    assert committed.status_code == 202
    assert commit_replay.json() == committed.json()
    assert committed.json()['data']['created_count'] == 1
