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
    created = client.post('/api/v1/admin/imports', headers={**headers, 'Idempotency-Key': str(uuid4())}, data={'resource': 'teas', 'schema_version': 'v1'}, files={'file': ('teas.csv', body, 'text/csv')})
    assert created.status_code == 202
    job = created.json()['data']
    committed = client.post(f"/api/v1/admin/imports/{job['id']}/commit", headers={**headers, 'Idempotency-Key': str(uuid4())}, json={'validation_version': job['validation_version'], 'mode': 'create_only'})
    assert committed.status_code == 202
    assert committed.json()['data']['created_count'] == 1
