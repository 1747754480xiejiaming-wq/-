from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.identity import AuditEntry


def append_audit(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    resource: str,
    object_id: str | None,
    request_id: str,
    summary: str,
    before_revision: int | None = None,
    after_revision: int | None = None,
) -> AuditEntry:
    entry = AuditEntry(
        id=str(uuid4()), actor_id=actor_id, action=action, resource=resource,
        object_id=object_id, request_id=request_id, summary_redacted=summary,
        before_revision=before_revision, after_revision=after_revision,
    )
    db.add(entry)
    return entry
