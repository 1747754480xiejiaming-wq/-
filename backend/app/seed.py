"""Create explicit demonstration records for local development only."""
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import create_database_engine, initialize_database, session_factory
from app.core.security import hash_password, verify_password
from app.models.content import ContentRecord, ContentRevision
from app.models.identity import AdminUser


def stable_id(name: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"https://chaxu.local/demo/{name}"))


DEMO_IDS = {
    name: stable_id(name)
    for name in [
        "operator", "reviewer", "lead", "admin", "source", "supplier", "longjing",
        "qimen", "longjing-2026", "longjing-2025", "qimen-2026", "qimen-draft",
        "longjing-effect", "longjing-brew", "qimen-brew", "offer-longjing", "offer-expired",
    ]
}

DEMO_PASSWORD = "TeaDemo2026!"


def add_content(db: Session, *, name: str, resource: str, title: str, payload: dict, status: str = "published", actor: str = "operator") -> ContentRecord:
    content_id = DEMO_IDS[name]
    existing = db.get(ContentRecord, content_id)
    if existing:
        return existing
    published = status == "published"
    now = datetime.now(timezone.utc)
    record = ContentRecord(
        id=content_id, legacy_id=name, resource=resource, title=title, payload=payload,
        status=status, publication_state="published" if published else None,
        published_revision=1 if published else None, published_payload=payload if published else None,
        created_by=DEMO_IDS[actor], updated_by=DEMO_IDS[actor], reviewed_by=DEMO_IDS["reviewer"] if published else None,
        reviewed_at=now if published else None,
    )
    db.add(record)
    db.add(ContentRevision(id=stable_id(f"revision:{name}:1"), content_id=content_id, revision=1, status=status, payload=payload, updated_by=DEMO_IDS[actor], reviewed_by=DEMO_IDS["reviewer"] if published else None))
    return record


def seed_database(db: Session) -> None:
    users = [
        ("operator", "数据运营智能体", "operator", ["content:read", "content:write", "content:lifecycle", "imports:write"], []),
        ("reviewer", "客户审核智能体", "reviewer", ["content:read", "content:review"], ["tea_content", "supply", "source_rights"]),
        ("lead", "线索跟进智能体", "lead", ["inquiries:read", "inquiries:write", "inquiries:export"], []),
        ("admin", "项目管理智能体", "admin", ["audit:read", "users:write", "inquiries:read_contact"], []),
    ]
    for username, display_name, role, permissions, domains in users:
        user = db.scalar(select(AdminUser).where(AdminUser.username == username))
        if not user:
            db.add(AdminUser(id=DEMO_IDS[username], username=username, display_name=display_name, role=role, password_hash=hash_password(DEMO_PASSWORD), permission_codes=permissions, review_domains=domains))
            continue
        user.display_name = display_name
        user.role = role
        user.permission_codes = permissions
        user.review_domains = domains
        if not verify_password(user.password_hash, DEMO_PASSWORD):
            user.password_hash = hash_password(DEMO_PASSWORD)
    db.flush()

    now = datetime.now(timezone.utc)
    source_payload = {
        "type": "internal", "title": "茶序示例冲泡资料", "author_or_org": "茶序演示团队",
        "source_date": "2026-09-08", "summary": "仅用于产品交互和接口联调的演示资料。", "file_ids": [],
        "rights": {"development": True, "retrieval": True, "evaluation": True, "public_metadata": True, "public_excerpt": True, "public_file": False, "authorization_note": "演示环境专用", "rights_holder": "茶序演示团队", "authorized_until": None},
        "valid_from": "2026-09-01", "valid_until": None, "revocation_kind": "none",
    }
    add_content(db, name="source", resource="sources", title=source_payload["title"], payload=source_payload)
    supplier_payload = {
        "name": "茶序演示供应方", "supplier_code": "DEMO-SUP-001", "cooperation_status": "active",
        "contact": {"name": "演示联系人", "phone": "13800138000"}, "qualifications": [],
        "disclosure": {"public_fields": ["name"], "reviewer_note": "演示环境"}, "source_ids": [DEMO_IDS["source"]],
    }
    add_content(db, name="supplier", resource="suppliers", title=supplier_payload["name"], payload=supplier_payload)
    tea_specs = [
        ("longjing", "西湖龙井", "绿茶", ["龙井"], "浙江 · 杭州", "杀青、揉捻、干燥"),
        ("qimen", "祁门红茶", "红茶", ["祁红"], "安徽 · 祁门", "萎凋、揉捻、发酵、干燥"),
    ]
    for key, name, category, aliases, origin, process in tea_specs:
        add_content(db, name=key, resource="teas", title=name, payload={"name": name, "category": category, "aliases": aliases, "origin": origin, "process": process, "source_ids": [DEMO_IDS["source"]]})
    items = [
        ("longjing-2026", "longjing", "西湖龙井", "LJ-050", "2026-SPR-A", 2026, ["清鲜", "豆香", "回甘"], "168", "扁平挺秀的叶形，清鲜的香气。", "特级"),
        ("longjing-2025", "longjing", "西湖龙井", "LJ-050", "2025-SPR-B", 2025, ["清香", "柔和", "甘润"], "", "当前批次提供茶类通用冲泡指引。", "一级"),
        ("qimen-2026", "qimen", "祁门红茶", "QM-050", "2026-SPR-A", 2026, ["花果香", "醇和", "甜润"], "128", "白瓷盖碗中慢慢释放花果香。", "特级"),
    ]
    for key, tea_key, name, sku, batch, year, taste, price, description, grade in items:
        add_content(db, name=key, resource="tea-items", title=f"{name} · {batch}", payload={"tea_id": DEMO_IDS[tea_key], "sku": sku, "batch_code": batch, "name": name, "grade": grade, "year": year, "specification": "50g / 罐", "storage": "阴凉、干燥、避光保存", "shelf_life_months": 18, "supplier_id": DEMO_IDS["supplier"], "source_ids": [DEMO_IDS["source"]], "media_file_ids": [], "subtitle": "从一片茶叶，到一杯好茶", "taste": taste, "price": price, "description": description})
    add_content(db, name="qimen-draft", resource="tea-items", title="祁门红茶 · 2026-AUT-A", status="pending_review", payload={"tea_id": DEMO_IDS["qimen"], "sku": "QM-100", "batch_code": "2026-AUT-A", "name": "祁门红茶 · 礼盒", "grade": "", "year": 2026, "specification": "100g / 盒", "storage": "", "shelf_life_months": None, "supplier_id": DEMO_IDS["supplier"], "source_ids": [DEMO_IDS["source"]], "media_file_ids": [], "subtitle": "新批次资料整理中", "taste": ["花果香", "甜香"], "price": "", "description": "审核发布前不公开。"})
    add_content(db, name="longjing-effect", resource="effects", title="西湖龙井感官说明", payload={"tea_id": DEMO_IDS["longjing"], "tea_item_id": None, "features": ["清鲜", "豆香", "回甘"], "scenarios": ["日常品饮"], "cautions": ["涉及健康状况请咨询专业人员"], "claims": [{"text": "本示例仅描述感官体验", "evidence_level": "experience", "source_ids": [DEMO_IDS["source"]]}], "source_ids": [DEMO_IDS["source"]], "valid_from": "2026-09-01"})
    add_content(db, name="longjing-brew", resource="brewing-recipes", title="西湖龙井 2026 冲泡", payload={"tea_id": DEMO_IDS["longjing"], "tea_item_id": DEMO_IDS["longjing-2026"], "title": "西湖龙井分步冲泡", "vessel": "玻璃杯", "water_ml": {"min": 150, "max": 180}, "tea_g": {"min": 3, "max": 3}, "temperature_c": {"min": 85, "max": 85}, "water_quality": "洁净软水", "rinse": False, "steps": [{"step_no": 1, "title": "温杯", "instruction": "以热水温杯后倒净。", "duration_seconds": 10}, {"step_no": 2, "title": "投茶", "instruction": "投入 3g 茶叶。", "duration_seconds": 5}, {"step_no": 3, "title": "注水", "instruction": "沿杯壁注入 85°C 水。", "duration_seconds": 30}, {"step_no": 4, "title": "品饮", "instruction": "留三分之一续水。", "duration_seconds": 0}], "adjustments": [{"condition": "too_strong", "instruction": "适当缩短浸泡时间。"}], "source_ids": [DEMO_IDS["source"]], "valid_from": "2026-09-01"})
    add_content(db, name="qimen-brew", resource="brewing-recipes", title="祁门红茶冲泡", payload={"tea_id": DEMO_IDS["qimen"], "tea_item_id": DEMO_IDS["qimen-2026"], "title": "祁门红茶分步冲泡", "vessel": "白瓷盖碗", "water_ml": {"min": 100, "max": 120}, "tea_g": {"min": 5, "max": 5}, "temperature_c": {"min": 90, "max": 90}, "water_quality": "洁净软水", "rinse": False, "steps": [{"step_no": 1, "title": "温器", "instruction": "温热盖碗。", "duration_seconds": 10}, {"step_no": 2, "title": "投茶", "instruction": "投入 5g 茶叶。", "duration_seconds": 5}, {"step_no": 3, "title": "注水", "instruction": "注入 90°C 水。", "duration_seconds": 20}, {"step_no": 4, "title": "出汤", "instruction": "快速沥尽茶汤。", "duration_seconds": 0}], "adjustments": [], "source_ids": [DEMO_IDS["source"]], "valid_from": "2026-09-01"})
    add_content(db, name="offer-longjing", resource="supply-offers", title="西湖龙井演示报价", payload={"tea_item_id": DEMO_IDS["longjing-2026"], "supplier_id": DEMO_IDS["supplier"], "offer_code": "DEMO-OFFER-001", "price_mode": "reference", "price": {"amount": "168.00", "currency": "CNY", "unit": "piece", "tax_included": True, "shipping_included": False}, "inventory_mode": "unknown", "quantity": None, "minimum_order": {"value": 1, "unit": "piece"}, "lead_time_text": "以正式沟通为准", "ship_from": "浙江杭州", "sample_rule": "可提交样品咨询", "as_of": now.isoformat(), "valid_from": (now - timedelta(days=1)).isoformat(), "valid_until": (now + timedelta(days=365)).isoformat(), "disclosure": {"public_fields": ["price", "ship_from", "sample_rule"], "reviewer_note": "演示"}, "source_ids": [DEMO_IDS["source"]]})
    add_content(db, name="offer-expired", resource="supply-offers", title="西湖龙井过期报价", payload={"tea_item_id": DEMO_IDS["longjing-2025"], "supplier_id": DEMO_IDS["supplier"], "offer_code": "DEMO-OFFER-OLD", "price_mode": "reference", "price": {"amount": "99.00", "currency": "CNY", "unit": "piece", "tax_included": True, "shipping_included": False}, "inventory_mode": "unknown", "quantity": None, "minimum_order": {"value": 1, "unit": "piece"}, "lead_time_text": "", "ship_from": "", "sample_rule": "", "as_of": (now - timedelta(days=400)).isoformat(), "valid_from": (now - timedelta(days=400)).isoformat(), "valid_until": (now - timedelta(days=30)).isoformat(), "disclosure": {"public_fields": ["price"], "reviewer_note": "演示过期"}, "source_ids": [DEMO_IDS["source"]]})
    db.commit()


def main() -> None:
    settings = get_settings()
    engine = create_database_engine(settings)
    initialize_database(engine)
    with session_factory(engine)() as db:
        seed_database(db)
    print("Demonstration seed data is ready.")


if __name__ == "__main__":
    main()
