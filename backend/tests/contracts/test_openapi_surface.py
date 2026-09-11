from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[3]


def operation_ids(document):
    return {operation['operationId'] for path in document['paths'].values() for method, operation in path.items() if method in {'get', 'post', 'patch', 'delete', 'put'}}


def test_static_contract_is_openapi_31_and_has_required_operations():
    document = yaml.safe_load((ROOT / 'contracts' / 'openapi.yaml').read_text(encoding='utf-8'))
    assert document['openapi'] == '3.1.0'
    assert {'getPublicConfig', 'listTeas', 'getTeaBrewing', 'createInquiry', 'loginAdmin', 'reviewContent', 'createImport', 'listAuditLogs'} <= operation_ids(document)


def test_implemented_runtime_operations_are_declared_in_static_contract(client):
    static = yaml.safe_load((ROOT / 'contracts' / 'openapi.yaml').read_text(encoding='utf-8'))
    runtime_ids = operation_ids(client.get('/openapi.json').json())
    static_ids = operation_ids(static)
    assert runtime_ids <= static_ids
