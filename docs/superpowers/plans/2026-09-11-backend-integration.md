# 茶序后端与前后端联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a contract-compatible FastAPI service with persisted tea content, public browsing, questions, inquiries, four-role administration, and a switchable React API client.

**Architecture:** `contracts/openapi.yaml` is the public source of truth. A FastAPI modular monolith wraps every JSON response in the contract envelope; SQLAlchemy persistence and service functions own authorization, publication filtering, version transitions, idempotency, and audit writes. SQLite is the explicit local development database and PostgreSQL is selected with `DATABASE_URL` for production.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest, HTTPX, React 19, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-09-11-backend-integration-design.md`

## Global Constraints

- API root is exactly `/api/v1`; `/health/live` and `/health/ready` are outside it.
- JSON uses snake_case; formal identifiers exposed by v1 are UUID strings; timestamps are UTC RFC 3339 strings.
- Success uses `{data,meta}`; failures use `{error,meta}`; `data` and `error` never coexist.
- Preserve current prototype routes, role names, item status labels, and localStorage fallback behavior.
- Every state-changing command requires UUID `Idempotency-Key`; all versioned writes require matching `If-Match`.
- Public data must satisfy publish state, parent visibility, current validity, and source-rights checks on every request.
- Do not represent seed data, rule answers, SQLite, or unconfigured integrations as production data or capabilities.
- Each completed code task updates root `README.md` and `VERSION_SNAPSHOTS.md`, runs its listed checks, and commits only its listed files with a `snapshot(code):` message.

---

## File Structure

- `contracts/openapi.yaml` — versioned OpenAPI 3.1 operations, schemas, error responses, and examples.
- `backend/pyproject.toml` / `backend/.env.example` — locked application/test dependencies and local runtime variables.
- `backend/app/main.py` — application factory, routers, CORS, cookies, exception/envelope middleware, health endpoints.
- `backend/app/core/{config,db,errors,security}.py` — configuration, engines/sessions, error vocabulary, passwords/CSRF/session helpers.
- `backend/app/models/*.py` — focused SQLAlchemy tables for identities, content, sources, offers, inquiries, idempotency, audits and events.
- `backend/app/schemas/*.py` — typed public/admin input and output DTOs, no generic `dict` content endpoint models.
- `backend/app/services/{publication,content,inquiries,questions,idempotency,audit}.py` — business rules and transactions.
- `backend/app/api/{public,auth,content,inquiries}.py` — route adapters with declared dependencies.
- `backend/app/seed.py` — explicit, repeatable non-production data setup.
- `backend/tests/{contracts,integration}/` — envelope, schema, authorization, state and data privacy tests.
- `prototype/src/api/{client,mapper,types}.ts` — typed fetch wrapper and reversible DTO-to-prototype adapters.
- `prototype/src/model.ts` / `prototype/src/main.tsx` — API mode state and boundary-only integration.

## Task 1: Establish the executable backend project and contract skeleton

**Files:**
- Create: `backend/pyproject.toml`, `backend/.env.example`, `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/core/config.py`, `backend/app/core/db.py`, `backend/app/core/errors.py`, `backend/tests/conftest.py`, `backend/tests/contracts/test_envelope.py`, `contracts/openapi.yaml`
- Modify: `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: `create_app() -> FastAPI`, `ApiError(code: str, status_code: int, message: str, details: list[dict])`, `GET /health/live`, `GET /api/v1/config`.
- Consumes: API root and envelope definitions from the approved spec.

- [ ] **Step 1: Write the failing envelope and health test**

```python
def test_config_has_contract_envelope(client):
    response = client.get('/api/v1/config')
    assert response.status_code == 200
    assert set(response.json()) == {'data', 'meta'}
    assert response.json()['meta']['request_id']

def test_live_health_does_not_expose_details(client):
    assert client.get('/health/live').json() == {'status': 'ok'}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend; python -m pytest tests/contracts/test_envelope.py -q`

Expected: FAIL because the application package does not exist.

- [ ] **Step 3: Add the minimal application factory and contract document**

```python
def success(data: object, request: Request) -> dict[str, object]:
    return {'data': data, 'meta': meta_for(request)}

@app.get('/health/live')
def live() -> dict[str, str]:
    return {'status': 'ok'}
```

Define `GET /api/v1/config` with operationId `getPublicConfig`, named `SuccessConfig` and `ErrorResponse` components, cookie security scheme, header parameters, and an example matching the JSON response. Set `openapi: 3.1.0`; do not leave unnamed paths or response models.

- [ ] **Step 4: Run checks**

Run: `cd backend; python -m pytest tests/contracts/test_envelope.py -q; python -m uvicorn app.main:app --port 8000`

Expected: tests PASS; `GET /health/live` returns only `{"status":"ok"}`.

- [ ] **Step 5: Document and commit**

Add the backend prerequisite and health check to README; append a snapshot row. Run `git diff --check`, then commit only Task 1 files:

```powershell
git add contracts/openapi.yaml backend README.md VERSION_SNAPSHOTS.md
git commit -m "snapshot(code): bootstrap backend contract service"
```

## Task 2: Add persistence, migrations, seed data, users, sessions, and CSRF

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/0001_initial.py`, `backend/app/models/{base,user,session,audit}.py`, `backend/app/core/security.py`, `backend/app/api/auth.py`, `backend/app/seed.py`, `backend/tests/integration/test_auth.py`
- Modify: `backend/app/main.py`, `backend/app/core/db.py`, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: `AdminUser`, `AdminSession`, `GET /admin/auth/csrf`, `POST /admin/auth/login`, `GET /admin/auth/me`, `POST /admin/auth/logout`.
- Consumes: `SessionLocal`, signed HttpOnly cookie named by `SESSION_COOKIE_NAME`, role codes `operator`, `reviewer`, `lead`, `admin`.

- [ ] **Step 1: Write failing authentication tests**

```python
def test_login_rotates_session_and_me_requires_cookie(client, seeded_users):
    token = client.get('/api/v1/admin/auth/csrf').json()['data']['csrf_token']
    result = client.post('/api/v1/admin/auth/login', headers={'X-CSRF-Token': token}, json={'username': 'operator', 'password': 'Operator1234!'})
    assert result.status_code == 200
    assert result.json()['data']['user']['username'] == 'operator'
    assert client.get('/api/v1/admin/auth/me').status_code == 200

def test_admin_write_without_csrf_is_rejected(client, authenticated_operator):
    assert client.post('/api/v1/admin/auth/logout').status_code == 403
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd backend; python -m pytest tests/integration/test_auth.py -q`

Expected: FAIL because no session tables or auth routes exist.

- [ ] **Step 3: Implement tables and route dependencies**

```python
def require_csrf(request: Request, principal: Principal = Depends(require_principal)) -> Principal:
    if not secrets.compare_digest(request.headers.get('X-CSRF-Token', ''), principal.csrf_token):
        raise ApiError('CSRF_INVALID', 403, '请求验证失败')
    return principal
```

Hash passwords with Argon2, rotate session IDs after login, persist expiry and CSRF token, reject disabled users, and seed one password-protected account per required role. Put seed credentials only in `.env.example` comments as development-only examples; seed command must be explicit and idempotent.

- [ ] **Step 4: Run migration, seed, and tests**

Run: `cd backend; python -m alembic upgrade head; python -m app.seed; python -m pytest tests/integration/test_auth.py -q`

Expected: migration and seed finish without duplicates; tests PASS.

- [ ] **Step 5: Document and commit**

Document migration, seed, login and cookie restrictions; record the snapshot and commit Task 2 files as `snapshot(code): add persisted admin authentication`.

## Task 3: Model content, source rights, offers, publication filtering, and seed catalog

**Files:**
- Create: `backend/app/models/{content,source,supply}.py`, `backend/app/schemas/{common,public}.py`, `backend/app/services/publication.py`, `backend/tests/integration/test_public_catalog.py`
- Modify: `backend/alembic/versions/0002_content.py`, `backend/app/seed.py`, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: `PublicationResolver.visible_tea_item(session, tea_item_id) -> TeaItem`, `TeaPublic`, `TeaItemPublic`, `SourceSummary`, `SupplyPublic`.
- Consumes: published state, `rights.public_metadata`, validity dates, parent entities and source references.

- [ ] **Step 1: Write failing publication tests**

```python
def test_public_item_requires_published_parent_and_rights(client, catalog):
    visible = client.get(f"/api/v1/tea-items/{catalog.visible_item_id}")
    hidden = client.get(f"/api/v1/tea-items/{catalog.withdrawn_source_item_id}")
    assert visible.status_code == 200
    assert hidden.status_code == 404
    assert 'purchase_price' not in visible.text
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd backend; python -m pytest tests/integration/test_public_catalog.py -q`

Expected: FAIL because catalog models and resolver do not exist.

- [ ] **Step 3: Implement focused models and resolver**

```python
def is_public(record: ContentRecord, now: datetime) -> bool:
    return record.status == ContentStatus.PUBLISHED and not record.deleted_at and within_validity(record, now) and sources_are_public(record.sources, now)
```

Model immutable content revisions plus one active record, `row_version`, source rights, supplier cooperation status and offer validity. Seed the two visible prototype teas, two Longjing batches, one pending item, one valid offer, one expired offer, and sources marked explicitly `development/demo`.

- [ ] **Step 4: Run tests**

Run: `cd backend; python -m pytest tests/integration/test_public_catalog.py -q`

Expected: PASS; hidden, expired and withdrawn dependencies return 404 or an empty list as specified.

- [ ] **Step 5: Document and commit**

Document the non-production catalog and source-rights filter; update snapshot records and commit Task 3 files as `snapshot(code): add tea catalog publication rules`.

## Task 4: Implement public catalog, content matching, supplies, and public errors

**Files:**
- Create: `backend/app/api/public.py`, `backend/app/services/catalog.py`, `backend/tests/contracts/test_public_api.py`
- Modify: `backend/app/main.py`, `backend/app/schemas/public.py`, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: U02–U10 excluding file streaming; `GET /teas`, `/teas/{tea_id}`, `/tea-items`, `/tea-items/{tea_item_id}`, effects, brewing and supplies.
- Consumes: `PublicationResolver`, page inputs `page` and `page_size`, `tea_item_id` association validator.

- [ ] **Step 1: Write contract tests**

```python
def test_brewing_rejects_item_from_other_tea(client, catalog):
    response = client.get(f'/api/v1/teas/{catalog.longjing_id}/brewing', params={'tea_item_id': catalog.qimen_item_id})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'

def test_expired_supply_returns_empty_page_without_price(client, catalog):
    body = client.get(f'/api/v1/teas/{catalog.longjing_id}/supplies').json()['data']
    assert body['items'] == [] or all('price' not in item or item['price'] is None for item in body['items'])
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend; python -m pytest tests/contracts/test_public_api.py -q`

Expected: FAIL because public endpoints are unregistered.

- [ ] **Step 3: Implement handlers and DTO projection**

Implement exact paging bounds, case-insensitive q/SKU filters, `Match` fallback only to the same Tea, and 404 for hidden detail. Project sources and offers by their disclosure permissions; never include supplier contact, raw authorization notes, private files or purchase price.

- [ ] **Step 4: Run checks**

Run: `cd backend; python -m pytest tests/contracts/test_public_api.py tests/integration/test_public_catalog.py -q`

Expected: PASS.

- [ ] **Step 5: Document and commit**

Add public API base URL and Swagger/ReDoc locations to README, update snapshot index, and commit Task 4 files as `snapshot(code): implement public tea browsing APIs`.

## Task 5: Implement idempotency, questions, inquiries, feedback, events, and lead privacy

**Files:**
- Create: `backend/app/models/{inquiry,idempotency,event}.py`, `backend/app/schemas/{inquiries,questions}.py`, `backend/app/services/{idempotency,inquiries,questions}.py`, `backend/tests/integration/test_public_writes.py`
- Modify: `backend/app/api/public.py`, `backend/app/seed.py`, migration, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: U11–U14, `IdempotencyService.execute(principal, method, path, key, body, operation) -> ResponseData`.
- Consumes: anonymous session created by config, current notice version, public TeaItem/offer resolver.

- [ ] **Step 1: Write failing idempotency and privacy tests**

```python
def test_inquiry_replays_once_and_hides_contact(client, public_session, catalog):
    headers = {'Idempotency-Key': str(uuid4()), 'Origin': 'http://127.0.0.1:4173'}
    body = inquiry_body(catalog.visible_item_id)
    first = client.post('/api/v1/inquiries', headers=headers, json=body)
    replay = client.post('/api/v1/inquiries', headers=headers, json=body)
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    assert '13800138000' not in first.text

def test_same_idempotency_key_with_other_body_conflicts(client, public_session):
    assert client.post('/api/v1/inquiries', headers=conflicting_key_headers, json=other_body).status_code == 409
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend; python -m pytest tests/integration/test_public_writes.py -q`

Expected: FAIL because persistent idempotency and public writes do not exist.

- [ ] **Step 3: Implement server-owned validation and rule answers**

Use a unique database scope `(principal_id, method, canonical_path, key)`, SHA-256 canonical JSON hash and stored status/body. Validate contact formats, user-affirmed current notice, publicly visible item/offer relationships, and same-origin development request. Return `boundary` for health-treatment phrases, `degraded` when `QA_MODE=off`, `unconfirmed` when evidence is unavailable, and `answered` with published source citations for seed brewing/general questions. Store no contact in events, audit summaries or answer input.

- [ ] **Step 4: Run tests**

Run: `cd backend; python -m pytest tests/integration/test_public_writes.py -q`

Expected: PASS including 409 duplicate-body conflict and 409 `NOTICE_CHANGED`.

- [ ] **Step 5: Document and commit**

Document anonymous cookie, idempotency key, rule-answer limitation and contact non-return policy; update snapshot records and commit Task 5 files as `snapshot(code): add public questions and inquiries`.

## Task 6: Implement content draft/version workflow and automatic review publication

**Files:**
- Create: `backend/app/schemas/content.py`, `backend/app/services/{content,audit}.py`, `backend/app/api/content.py`, `backend/tests/integration/test_content_workflow.py`
- Modify: models/migration, `backend/app/main.py`, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: C01–C10 and C13 for `teas`, `tea-items`, `effects`, `brewing-recipes`, `suppliers`, `supply-offers`, `sources`.
- Consumes: `require_permission`, `If-Match: "rv-{row_version}"`, `ContentService.transition`.

- [ ] **Step 1: Write failing workflow tests**

```python
def test_reviewer_cannot_approve_own_version(client, reviewer_who_authored_draft):
    response = client.post(review_url, headers=etag_and_key_headers, json={'revision': 1, 'decision': 'approve', 'comment': '符合资料范围'})
    assert response.status_code == 403

def test_approved_draft_is_published_and_publicly_readable(client, separate_reviewer, draft):
    result = approve(client, separate_reviewer, draft)
    assert result.json()['data']['status'] == 'published'
    assert client.get(public_item_url(draft.id)).status_code == 200
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend; python -m pytest tests/integration/test_content_workflow.py -q`

Expected: FAIL because content routes and transitions do not exist.

- [ ] **Step 3: Implement typed resources and transactions**

Define individual Pydantic create/patch models per resource, reject unknown fields, validate required publish fields and reference dependencies, then atomically set reviewer, reviewed timestamp, `published_revision`, status and audit row. Freeze pending_review versions. Return 428 when ETag is absent and 409 `VERSION_CONFLICT` if stale. Maintain visible published revision while a later draft/rejected revision exists.

- [ ] **Step 4: Run checks**

Run: `cd backend; python -m pytest tests/integration/test_content_workflow.py -q`

Expected: PASS; self-review denied and approval changes the public response in the same transaction.

- [ ] **Step 5: Document and commit**

Document four role limits, ETag and auto-publication; update snapshots and commit Task 6 files as `snapshot(code): add reviewed content publishing workflow`.

## Task 7: Implement withdrawal, relisting, source rights revocation, deletion, and audit records

**Files:**
- Create: `backend/tests/integration/test_content_lifecycle.py`
- Modify: `backend/app/services/{content,publication,audit}.py`, `backend/app/api/content.py`, models/migration, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: C11–C13 and append-only `AuditEntry` writes.
- Consumes: published contents, exact prior published revision, source rights classifier.

- [ ] **Step 1: Write failing lifecycle tests**

```python
def test_withdraw_then_relist_keeps_revision_and_needs_no_review(client, operator, published_item):
    withdrawn = withdraw(client, operator, published_item)
    relisted = relist(client, operator, withdrawn)
    assert relisted.json()['data']['revision'] == published_item.revision
    assert relisted.json()['data']['status'] == 'published'

def test_relist_does_not_restore_external_rights_revocation(client, operator, externally_revoked_item):
    assert relist(client, operator, externally_revoked_item).status_code == 409
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend; python -m pytest tests/integration/test_content_lifecycle.py -q`

Expected: FAIL because lifecycle commands do not exist.

- [ ] **Step 3: Implement strict lifecycle transitions**

Allow withdrawal only from published and relist only from withdrawn. Restore only a source marked as the demonstration withdrawal caused by the same item lifecycle; reject independently revoked, expired or legally disabled sources. Allow an operator to delete only their unsubmitted tea-item draft, and an admin to logically delete all tea items. Every command emits an audit row with request id and redacted summary.

- [ ] **Step 4: Run checks**

Run: `cd backend; python -m pytest tests/integration/test_content_lifecycle.py tests/integration/test_public_catalog.py -q`

Expected: PASS; deleted/withdrawn items are not public and audit rows remain.

- [ ] **Step 5: Document and commit**

Document the narrow demonstration-source restoration rule and logical deletion; update snapshots and commit Task 7 files as `snapshot(code): add content lifecycle and audit rules`.

## Task 8: Implement lead follow-up, contact masking, and audit viewing

**Files:**
- Create: `backend/app/api/inquiries.py`, `backend/app/schemas/admin.py`, `backend/tests/integration/test_lead_access.py`
- Modify: `backend/app/services/inquiries.py`, `backend/app/main.py`, `contracts/openapi.yaml`, `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: M01–M03 and M10.
- Consumes: roles `lead`/`admin`, permission `inquiries:read_contact`, row version ETag.

- [ ] **Step 1: Write failing lead access tests**

```python
def test_lead_list_masks_contact_and_cannot_read_full_contact(client, lead):
    listing = list_inquiries(client, lead)
    assert '138****8000' in listing.text
    detail = client.get(detail_url, headers=lead.headers)
    assert 'contact' not in detail.json()['data']

def test_invalid_status_regression_conflicts(client, lead, contacted_inquiry):
    response = patch_inquiry(client, lead, contacted_inquiry, {'status': 'assigned'})
    assert response.status_code == 409
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend; python -m pytest tests/integration/test_lead_access.py -q`

Expected: FAIL because admin inquiry routes are unavailable.

- [ ] **Step 3: Implement projected query and update rules**

Always return `contact_masked` in summaries. Include plaintext `contact` only when the current principal has `inquiries:read_contact`, append a contact-view audit record, and keep contact out of log/error payloads. Enforce the listed one-way status graph, required close notes, active lead assignee and If-Match.

- [ ] **Step 4: Run checks**

Run: `cd backend; python -m pytest tests/integration/test_lead_access.py -q`

Expected: PASS.

- [ ] **Step 5: Document and commit**

Document masked-first UI behavior and sensitive contact permission; update snapshots and commit Task 8 files as `snapshot(code): add lead follow-up authorization`.

## Task 9: Add typed React API boundary and opt-in live mode

**Files:**
- Create: `prototype/src/api/{types,client,mapper}.ts`, `prototype/.env.example`
- Modify: `prototype/src/model.ts`, `prototype/src/main.tsx`, `prototype/package.json`, `README.md`, `VERSION_SNAPSHOTS.md`
- Test: `prototype/src/api/mapper.test.ts`

**Interfaces:**
- Produces: `createTeaApi(baseUrl: string): TeaApi`, `mapTeaItem(dto: TeaItemPublic): TeaItem`, `VITE_API_BASE_URL` opt-in.
- Consumes: public OpenAPI DTO types and existing `TeaItem`, `Lead`, routes, localStorage model.

- [ ] **Step 1: Write failing mapping test**

```ts
it('maps a formal tea item without changing the current card model', () => {
  expect(mapTeaItem(publicItem)).toMatchObject({ id: publicItem.legacy_id, batch: publicItem.batch_code, sku: publicItem.sku })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd prototype; npm run test -- mapper.test.ts`

Expected: FAIL because the API module and test script do not exist.

- [ ] **Step 3: Add typed fetch wrapper and boundary-only loading**

```ts
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { credentials: 'include', ...init })
  if (!response.ok) throw await parseApiError(response)
  return (await response.json() as Success<T>).data
}
```

When API mode is set, load config/catalog into the existing context and retain the current local state if API loading fails. Keep all current route renderers and UI business decisions intact; use server identifiers internally, map legacy IDs only at the display boundary, and never send localStorage mutations to the service automatically.

- [ ] **Step 4: Run checks**

Run: `cd prototype; npm run test -- mapper.test.ts; npm run build`

Expected: mapping test and TypeScript/Vite build PASS.

- [ ] **Step 5: Document and commit**

Document `VITE_API_BASE_URL`, startup order and fallback behavior; update snapshots and commit Task 9 files as `snapshot(code): add switchable frontend API client`.

## Task 10: Run end-to-end contract checks, package local development, and publish the snapshot

**Files:**
- Create: `backend/tests/contracts/test_openapi_surface.py`, `docs/acceptance/backend-local-integration.md`, `scripts/run-local-integration.ps1`
- Modify: `README.md`, `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Produces: documented commands that start migrated/seeded API and prototype together, plus a reproducible smoke result.
- Consumes: Tasks 1–9, API URL `http://127.0.0.1:8000/api/v1`, prototype URL `http://127.0.0.1:4173`.

- [ ] **Step 1: Write failing OpenAPI surface test**

```python
def test_contract_contains_implemented_public_and_admin_operations(openapi):
    ids = {operation['operationId'] for path in openapi['paths'].values() for operation in path.values() if isinstance(operation, dict)}
    assert {'getPublicConfig', 'listTeas', 'createInquiry', 'loginAdmin', 'reviewContent'} <= ids
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd backend; python -m pytest tests/contracts/test_openapi_surface.py -q`

Expected: FAIL until every required operationId exists.

- [ ] **Step 3: Add a non-destructive local integration script**

The script checks tools, applies migrations, seeds only when `-Seed` is passed, starts the API and Vite on explicit localhost ports, waits for `/health/ready`, and prints exact browser URLs. It must not delete databases or kill unrelated processes. The acceptance record must list T01–T23 coverage, actual commands, test counts, API/contract commit IDs and known deliberate exclusions (real model, file storage, import/export workers, production PostgreSQL verification).

- [ ] **Step 4: Run final checks**

Run: `cd backend; python -m pytest -q; python -m alembic upgrade head; python -m app.seed`

Run: `cd prototype; npm run build`

Run: `powershell -ExecutionPolicy Bypass -File scripts/run-local-integration.ps1 -Seed`

Expected: backend tests PASS, frontend build PASS, readiness is 200, and public catalog plus inquiry smoke checks return formal envelopes.

- [ ] **Step 5: Document, commit, and push**

Update root README and snapshot table with exact verification commands and commit hash. Commit only Task 10 files as `snapshot(code): verify backend frontend local integration`, then push the current snapshot branch:

```powershell
git add scripts docs/acceptance README.md VERSION_SNAPSHOTS.md
git commit -m "snapshot(code): verify backend frontend local integration"
git push origin HEAD:main
```

If remote write fails, retain the local commit and label it `待推送` in the acceptance record and final handoff.

## Plan Self-Review

- Spec coverage: Tasks 1–4 establish contract, persistence, tea/batch/archive/source/public filtering; Task 5 handles question, brewing events, feedback, consultation, idempotency; Tasks 6–7 cover review auto-publication, withdrawal/relist, source rules, deletion and audit; Task 8 covers lead privacy; Task 9 preserves the current front-end interaction while providing opt-in live HTTP; Task 10 validates and packages the whole path.
- Placeholder scan: no deferred implementation markers or generic error-handling instructions appear; each task specifies tests, commands and concrete target files.
- Type consistency: backend route DTOs use snake_case public schemas; frontend adapters map only at the `TeaItem`/`Lead` boundary; version writes consistently use `If-Match` and mutations consistently use `Idempotency-Key`.
