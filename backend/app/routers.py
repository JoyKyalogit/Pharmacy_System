import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limit_key, auth_rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user, require_roles
from app.models import AuditLog, Batch, Drug, Role, Sale, SaleItem, User
from app.schemas import (
    BatchCreate,
    BatchUpdate,
    ChangePasswordRequest,
    DeskLoginRequest,
    DrugCreate,
    DrugUpdate,
    LoginRequest,
    SaleCreate,
    SaleCreateResponse,
    StaffPinLoginRequest,
    TokenResponse,
    UserCreate,
    UserUpdate,
)

router = APIRouter(prefix="/api/v1")


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    limit_key = auth_rate_limit_key(request, "admin-login")
    auth_rate_limiter.check_allowed(limit_key)
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        auth_rate_limiter.record_failure(limit_key)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    auth_rate_limiter.record_success(limit_key)
    token = create_access_token(str(user.id), user.role.name)
    user.last_login_at = datetime.now(timezone.utc)
    db.add(AuditLog(user_id=user.id, action="LOGIN", entity_type="user", entity_id=str(user.id), payload={}))
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role.name},
    }


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")
    user.password_hash = hash_password(payload.new_password)
    db.add(
        AuditLog(
            user_id=user.id,
            action="CHANGE_PASSWORD",
            entity_type="user",
            entity_id=str(user.id),
            payload={},
        )
    )
    db.commit()
    return {"status": "ok", "message": "Password updated"}


@router.get("/auth/desk-staff")
def desk_staff_directory(db: Session = Depends(get_db)):
    """Names shown on the shared desk login screen (PIN identifies the person)."""
    rows = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name.asc())).all()
    return [
        {"id": u.id, "name": u.full_name, "role": u.role.name if u.role else None}
        for u in rows
        if u.role and u.role.name in ("Admin", "Pharmacist", "Cashier")
    ]


@router.post("/auth/staff-login", response_model=TokenResponse)
def staff_pin_login(payload: StaffPinLoginRequest, request: Request, db: Session = Depends(get_db)):
    limit_key = auth_rate_limit_key(request, "staff-pin-login")
    auth_rate_limiter.check_allowed(limit_key)
    user = db.get(User, payload.user_id)
    if not user or not user.is_active or not verify_password(payload.pin, user.password_hash):
        auth_rate_limiter.record_failure(limit_key)
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    if not user.role or user.role.name not in ("Admin", "Pharmacist", "Cashier"):
        raise HTTPException(status_code=403, detail="This account cannot use the pharmacy desk.")
    auth_rate_limiter.record_success(limit_key)
    token = create_access_token(str(user.id), user.role.name)
    user.last_login_at = datetime.now(timezone.utc)
    db.add(AuditLog(user_id=user.id, action="STAFF_PIN_LOGIN", entity_type="user", entity_id=str(user.id), payload={}))
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role.name},
    }


@router.post("/auth/desk-login", response_model=TokenResponse)
def desk_login(payload: DeskLoginRequest, request: Request, db: Session = Depends(get_db)):
    limit_key = auth_rate_limit_key(request, "desk-login")
    auth_rate_limiter.check_allowed(limit_key)
    expected = settings.kiosk_pin.strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Desk PIN is not configured on the server.")
    provided = payload.pin.strip()
    if not secrets.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        auth_rate_limiter.record_failure(limit_key)
        raise HTTPException(status_code=401, detail="Incorrect desk PIN.")
    auth_rate_limiter.record_success(limit_key)
    staff_email = settings.seed_staff_email.strip().lower()
    user = db.scalar(select(User).where(User.email == staff_email, User.is_active.is_(True)))
    if not user:
        raise HTTPException(status_code=503, detail="Staff account missing. Run python scripts/seed.py.")
    token = create_access_token(str(user.id), user.role.name)
    user.last_login_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=user.id,
            action="DESK_LOGIN",
            entity_type="user",
            entity_id=str(user.id),
            payload={},
        )
    )
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role.name},
    }


@router.post("/drugs")
def create_drug(
    payload: DrugCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist")),
):
    data = payload.model_dump()
    if not data.get("purchase_unit"):
        data["purchase_unit"] = "pack"
    if not data.get("units_per_purchase"):
        data["units_per_purchase"] = 1
    drug = Drug(**data)
    db.add(drug)
    db.flush()
    db.add(AuditLog(user_id=user.id, action="CREATE_DRUG", entity_type="drug", entity_id=str(drug.id), payload={}))
    db.commit()
    db.refresh(drug)
    return {"id": drug.id, "name": drug.name, "sku": drug.sku, "reorder_level": drug.reorder_level, "is_active": drug.is_active}


@router.get("/drugs/match")
def match_drug_by_name(
    name: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist")),
):
    term = name.strip()
    if not term:
        return {"match": None}
    drug = db.scalar(
        select(Drug)
        .where(Drug.is_active.is_(True), func.lower(Drug.name) == term.lower())
        .order_by(Drug.id.asc())
    )
    if not drug:
        return {"match": None}
    latest_batch = db.scalar(select(Batch).where(Batch.drug_id == drug.id).order_by(Batch.id.desc()))
    return {
        "match": {
            "drug_id": drug.id,
            "drug_name": drug.name,
            "unit": drug.unit,
            "purchase_unit": drug.purchase_unit,
            "units_per_purchase": int(drug.units_per_purchase or 1),
            "reorder_level": int(drug.reorder_level or 0),
            "last_selling_price": float(latest_batch.selling_price) if latest_batch else None,
            "last_unit_cost": float(latest_batch.unit_cost) if latest_batch else None,
        }
    }


@router.get("/drugs/search")
def search_drugs(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist", "Cashier")),
):
    search_term = f"%{q.strip()}%"
    rows = db.execute(
        select(
            Drug.id,
            Drug.name,
            Drug.sku,
            Drug.unit,
            Drug.units_per_purchase,
            Drug.purchase_unit,
            func.coalesce(func.sum(Batch.quantity_available), 0).label("total_quantity"),
            func.min(Batch.selling_price).label("unit_price"),
        )
        .join(Batch, Batch.drug_id == Drug.id, isouter=True)
        .where(Drug.is_active.is_(True))
        .where((Drug.name.ilike(search_term)) | (Drug.sku.ilike(search_term)))
        .group_by(Drug.id)
        .order_by(Drug.name.asc())
        .limit(15)
    ).all()
    return [
        {
            "drug_id": r.id,
            "drug_name": r.name,
            "sku": r.sku,
            "unit": r.unit,
            "purchase_unit": r.purchase_unit,
            "units_per_purchase": r.units_per_purchase,
            "available_quantity": int(r.total_quantity or 0),
            "unit_price": float(r.unit_price or 0),
        }
        for r in rows
    ]


@router.get("/drugs/search-batches")
def search_drugs_batches(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist", "Cashier")),
):
    search_term = f"%{q.strip()}%"
    rows = db.execute(
        select(
            Drug.id.label("drug_id"),
            Drug.name.label("drug_name"),
            Drug.sku,
            Drug.unit,
            Drug.units_per_purchase,
            Drug.purchase_unit,
            Batch.id.label("batch_id"),
            Batch.batch_no,
            Batch.expiry_date,
            Batch.quantity_available,
            Batch.selling_price,
        )
        .join(Batch, Batch.drug_id == Drug.id)
        .where(Drug.is_active.is_(True))
        .where(Batch.quantity_available > 0)
        .where(Batch.expiry_date >= date.today())
        .where((Drug.name.ilike(search_term)) | (Drug.sku.ilike(search_term)) | (Batch.batch_no.ilike(search_term)))
        .order_by(Drug.name.asc(), Batch.expiry_date.asc(), Batch.id.asc())
        .limit(30)
    ).all()
    return [
        {
            "drug_id": r.drug_id,
            "drug_name": r.drug_name,
            "sku": r.sku,
            "unit": r.unit,
            "purchase_unit": r.purchase_unit,
            "units_per_purchase": int(r.units_per_purchase or 1),
            "batch_id": r.batch_id,
            "batch_no": r.batch_no,
            "expiry_date": r.expiry_date,
            "available_quantity": int(r.quantity_available or 0),
            "unit_price": float(r.selling_price or 0),
            "days_to_expiry": (r.expiry_date - date.today()).days,
        }
        for r in rows
    ]


@router.put("/drugs/{drug_id}")
def update_drug(
    drug_id: int,
    payload: DrugUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist")),
):
    drug = db.get(Drug, drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail="Drug not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(drug, key, value)
    db.add(AuditLog(user_id=user.id, action="UPDATE_DRUG", entity_type="drug", entity_id=str(drug.id), payload=updates))
    db.commit()
    db.refresh(drug)
    return {
        "id": drug.id,
        "name": drug.name,
        "sku": drug.sku,
        "reorder_level": drug.reorder_level,
        "is_active": drug.is_active,
    }


@router.delete("/drugs/{drug_id}")
def delete_drug(
    drug_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist")),
):
    drug = db.get(Drug, drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail="Drug not found")
    drug.is_active = False
    db.add(AuditLog(user_id=user.id, action="DELETE_DRUG", entity_type="drug", entity_id=str(drug.id), payload={"soft_delete": True}))
    db.commit()
    return {"status": "deleted", "drug_id": drug_id}


@router.post("/stock/batches")
def receive_batch(
    payload: BatchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist")),
):
    if payload.expiry_date <= date.today():
        raise HTTPException(status_code=400, detail="Cannot receive expired batch")
    drug = db.get(Drug, payload.drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail="Drug not found")
    if payload.quantity_received_purchase and payload.quantity_received:
        raise HTTPException(status_code=400, detail="Provide either quantity_received_purchase or quantity_received, not both")
    if payload.quantity_received_purchase:
        quantity_received = int(payload.quantity_received_purchase) * int(drug.units_per_purchase or 1)
    elif payload.quantity_received:
        quantity_received = int(payload.quantity_received)
    else:
        raise HTTPException(status_code=400, detail="Quantity is required")
    batch = Batch(
        drug_id=payload.drug_id,
        supplier_id=payload.supplier_id,
        batch_no=payload.batch_no,
        expiry_date=payload.expiry_date,
        quantity_received=quantity_received,
        quantity_available=quantity_received,
        unit_cost=payload.unit_cost,
        selling_price=payload.selling_price,
    )
    db.add(batch)
    db.flush()
    db.add(AuditLog(user_id=user.id, action="CREATE_BATCH", entity_type="batch", entity_id=str(batch.id), payload={}))
    db.commit()
    return {
        "id": batch.id,
        "drug_id": batch.drug_id,
        "batch_no": batch.batch_no,
        "available_quantity": batch.quantity_available,
        "status": "ACTIVE",
    }


@router.put("/stock/batches/{batch_id}")
def update_batch(
    batch_id: int,
    payload: BatchUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist")),
):
    batch = db.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    updates = payload.model_dump(exclude_unset=True)
    audit_payload = payload.model_dump(exclude_unset=True, mode="json")
    for key, value in updates.items():
        setattr(batch, key, value)
    if "quantity_available" in updates and batch.quantity_available > batch.quantity_received:
        batch.quantity_received = batch.quantity_available
    db.add(AuditLog(user_id=user.id, action="UPDATE_BATCH", entity_type="batch", entity_id=str(batch.id), payload=audit_payload))
    db.commit()
    db.refresh(batch)
    return {
        "id": batch.id,
        "drug_id": batch.drug_id,
        "batch_no": batch.batch_no,
        "expiry_date": batch.expiry_date,
        "quantity_available": batch.quantity_available,
        "unit_cost": float(batch.unit_cost),
        "selling_price": float(batch.selling_price),
    }


@router.get("/stock/levels")
def stock_levels(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Pharmacist", "Cashier"))):
    rows = db.execute(
        select(
            Drug.id,
            Drug.name,
            Drug.unit,
            Drug.purchase_unit,
            Drug.units_per_purchase,
            Drug.reorder_level,
            Batch.id.label("batch_id"),
            Batch.batch_no,
            Batch.expiry_date,
            Batch.quantity_available,
            Batch.unit_cost,
            Batch.selling_price,
        )
        .join(Batch, Batch.drug_id == Drug.id, isouter=True)
        .where(Drug.is_active.is_(True))
        .order_by(Drug.name.asc(), Batch.expiry_date.asc(), Batch.id.asc())
    ).all()
    warning_cutoff = date.today() + timedelta(days=settings.expiry_warning_days)
    drug_totals: dict[int, int] = {}
    for r in rows:
        drug_totals[r.id] = drug_totals.get(r.id, 0) + int(r.quantity_available or 0)
    result = []
    for r in rows:
        nearest_expiry = r.expiry_date
        days_to_expiry = None
        is_near_expiry = False
        is_expired = False
        if nearest_expiry:
            days_to_expiry = (nearest_expiry - date.today()).days
            is_expired = days_to_expiry < 0
            is_near_expiry = not is_expired and nearest_expiry <= warning_cutoff
        qty = int(r.quantity_available or 0)
        total_for_drug = int(drug_totals.get(r.id, 0))
        result.append(
            {
                "drug_id": r.id,
                "drug_name": r.name,
                "unit": r.unit,
                "purchase_unit": r.purchase_unit,
                "units_per_purchase": int(r.units_per_purchase or 1),
                "total_quantity": qty if r.batch_id else total_for_drug,
                "unit_price": float(r.selling_price or 0),
                "unit_cost": float(r.unit_cost or 0),
                "reorder_level": r.reorder_level,
                "is_low_stock": qty <= r.reorder_level,
                "nearest_expiry": nearest_expiry,
                "days_to_expiry": days_to_expiry,
                "is_near_expiry": is_near_expiry,
                "is_expired": is_expired,
                "batch_id": int(r.batch_id) if r.batch_id else None,
                "batch_no": (r.batch_no or "").strip() or None,
            }
        )
    return result


@router.get("/reports/sales-today")
def sales_today(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    today = date.today()
    start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    end = start.replace(hour=23, minute=59, second=59, microsecond=999999)
    totals = db.execute(
        select(
            func.count(Sale.id).label("sales_count"),
            func.coalesce(func.sum(Sale.grand_total), 0).label("gross_revenue"),
        ).where(Sale.created_at >= start, Sale.created_at <= end)
    ).one()
    return {
        "date": str(today),
        "sales_count": int(totals.sales_count or 0),
        "gross_revenue": float(totals.gross_revenue or 0),
    }


@router.get("/reports/sales-summary")
def sales_summary(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    preset: str = Query("today"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin")),
):
    today = date.today()
    if preset == "month":
        start_date = date(today.year, today.month, 1)
        end_date = today
    elif preset == "today":
        start_date = today
        end_date = today
    else:
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="start_date and end_date are required for custom preset")
    start = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
    end = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    totals = db.execute(
        select(
            func.count(Sale.id).label("sales_count"),
            func.coalesce(func.sum(Sale.grand_total), 0).label("gross_revenue"),
        ).where(Sale.created_at >= start, Sale.created_at <= end)
    ).one()
    daily_rows = db.execute(
        select(
            func.date(Sale.created_at).label("sale_date"),
            func.count(Sale.id).label("sales_count"),
            func.coalesce(func.sum(Sale.grand_total), 0).label("gross_revenue"),
        )
        .where(Sale.created_at >= start, Sale.created_at <= end)
        .group_by(func.date(Sale.created_at))
        .order_by(func.date(Sale.created_at).asc())
    ).all()
    daily_map = {
        r.sale_date: {"sales_count": int(r.sales_count or 0), "gross_revenue": float(r.gross_revenue or 0)} for r in daily_rows
    }
    daily_totals = []
    cursor = start_date
    while cursor <= end_date:
        day_stats = daily_map.get(cursor, {"sales_count": 0, "gross_revenue": 0.0})
        daily_totals.append(
            {
                "date": str(cursor),
                "day": cursor.day,
                "sales_count": day_stats["sales_count"],
                "gross_revenue": day_stats["gross_revenue"],
            }
        )
        cursor += timedelta(days=1)
    items = db.execute(
        select(
            Drug.id.label("drug_id"),
            Drug.name.label("drug_name"),
            func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SaleItem.line_total), 0).label("amount"),
            func.coalesce(func.sum(SaleItem.quantity * Batch.unit_cost), 0).label("buying_cost"),
        )
        .join(SaleItem, SaleItem.drug_id == Drug.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .outerjoin(Batch, Batch.id == SaleItem.batch_id)
        .where(Sale.created_at >= start, Sale.created_at <= end)
        .group_by(Drug.id, Drug.name)
        .order_by(func.coalesce(func.sum(SaleItem.quantity), 0).desc())
    ).all()
    by_pharmacist_rows = db.execute(
        select(
            User.id.label("user_id"),
            User.full_name.label("pharmacist_name"),
            func.date(Sale.created_at).label("sale_date"),
            func.count(Sale.id).label("sales_count"),
            func.coalesce(func.sum(Sale.grand_total), 0).label("gross_revenue"),
        )
        .join(User, User.id == Sale.cashier_id)
        .where(Sale.created_at >= start, Sale.created_at <= end)
        .group_by(User.id, User.full_name, func.date(Sale.created_at))
        .order_by(func.date(Sale.created_at).asc(), User.full_name.asc())
    ).all()
    return {
        "range": {"start_date": str(start_date), "end_date": str(end_date)},
        "sales_count": int(totals.sales_count or 0),
        "gross_revenue": float(totals.gross_revenue or 0),
        "daily_totals": daily_totals,
        "by_pharmacist": [
            {
                "user_id": int(r.user_id),
                "pharmacist_name": r.pharmacist_name,
                "date": str(r.sale_date),
                "sales_count": int(r.sales_count or 0),
                "gross_revenue": float(r.gross_revenue or 0),
            }
            for r in by_pharmacist_rows
        ],
        "items": [
            {
                "drug_id": int(r.drug_id),
                "drug_name": r.drug_name,
                "quantity": int(r.quantity or 0),
                "amount": float(r.amount or 0),
                "buying_price": float(r.buying_cost or 0) / int(r.quantity or 1) if int(r.quantity or 0) else 0.0,
                "buying_cost": float(r.buying_cost or 0),
            }
            for r in items
        ],
    }


@router.post("/sales", response_model=SaleCreateResponse)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Pharmacist", "Cashier")),
):
    if payload.sale_type == "PRESCRIPTION" and not payload.prescription_ref:
        raise HTTPException(status_code=400, detail="PRESCRIPTION sale requires prescription_ref")
    subtotal = 0.0
    discount_total = 0.0
    sale_lines: list[dict] = []
    for item in payload.items:
        needed = item.quantity
        batch = db.scalar(
            select(Batch)
            .where(
                Batch.id == item.batch_id,
                Batch.drug_id == item.drug_id,
                Batch.expiry_date >= date.today(),
                Batch.quantity_available > 0,
            )
            .with_for_update()
        )
        if not batch:
            raise HTTPException(status_code=400, detail=f"Batch unavailable for drug_id={item.drug_id}")
        if batch.quantity_available < needed:
            raise HTTPException(status_code=400, detail=f"INSUFFICIENT_STOCK for batch_id={item.batch_id}")
        batch.quantity_available -= needed
        line_total = (item.unit_price * needed) - item.discount
        subtotal += item.unit_price * needed
        discount_total += item.discount
        sale_lines.append(
            {
                "drug_id": item.drug_id,
                "batch_id": batch.id,
                "quantity": needed,
                "unit_price": item.unit_price,
                "discount_amount": item.discount,
                "line_total": line_total,
            }
        )

    grand_total = subtotal - discount_total
    year = datetime.now().year
    existing_receipts = db.scalars(select(Sale.receipt_no).where(Sale.receipt_no.like(f"%/{year}"))).all()
    max_seq = 0
    for receipt in existing_receipts:
        try:
            max_seq = max(max_seq, int(str(receipt).split("/")[0]))
        except (TypeError, ValueError):
            continue
    receipt_no = f"{max_seq + 1:05d}/{year}"
    sale = Sale(
        receipt_no=receipt_no,
        cashier_id=user.id,
        sale_type=payload.sale_type,
        prescription_ref=payload.prescription_ref,
        customer_name=payload.customer_name,
        kra_pin=payload.kra_pin,
        etr_serial=payload.etr_serial,
        etr_status="PENDING",
        payment_method=payload.payment_method,
        subtotal=subtotal,
        discount_total=discount_total,
        tax_total=0,
        grand_total=grand_total,
    )
    db.add(sale)
    db.flush()
    for line in sale_lines:
        db.add(SaleItem(sale_id=sale.id, **line))
    db.add(
        AuditLog(
            user_id=user.id,
            action="FINALIZE_SALE",
            entity_type="sale",
            entity_id=str(sale.id),
            payload={"items_count": len(sale_lines), "etr_status": sale.etr_status},
        )
    )
    db.commit()
    db.refresh(sale)
    return {
        "sale_id": sale.id,
        "receipt_no": sale.receipt_no,
        "subtotal": float(sale.subtotal),
        "discount_total": float(sale.discount_total),
        "tax_total": float(sale.tax_total),
        "grand_total": float(sale.grand_total),
        "payment_method": sale.payment_method,
        "kra_pin": sale.kra_pin,
        "etr_serial": sale.etr_serial,
        "etr_status": sale.etr_status,
        "created_at": sale.created_at,
    }


@router.get("/sales/{sale_id}")
def get_sale(sale_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Pharmacist", "Cashier"))):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    items = db.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id)).all()
    return {
        "id": sale.id,
        "sale_type": sale.sale_type,
        "cashier_id": sale.cashier_id,
        "kra_pin": sale.kra_pin,
        "etr_serial": sale.etr_serial,
        "etr_status": sale.etr_status,
        "items": [{"drug_id": i.drug_id, "quantity": i.quantity, "unit_price": float(i.unit_price), "line_total": float(i.line_total)} for i in items],
        "totals": {"grand_total": float(sale.grand_total)},
    }


@router.get("/reports/low-stock")
def low_stock_report(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    rows = db.execute(
        select(Drug.id, Drug.name, func.coalesce(func.sum(Batch.quantity_available), 0).label("qty"), Drug.reorder_level)
        .join(Batch, Batch.drug_id == Drug.id, isouter=True)
        .group_by(Drug.id)
        .having(func.coalesce(func.sum(Batch.quantity_available), 0) <= Drug.reorder_level)
    ).all()
    return [{"drug_id": r.id, "drug_name": r.name, "current_quantity": int(r.qty or 0), "reorder_level": r.reorder_level} for r in rows]


@router.get("/users")
def list_users(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    rows = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name.asc())).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "role": u.role.name if u.role else None,
            "is_active": u.is_active,
        }
        for u in rows
    ]


@router.post("/users")
def create_user(payload: UserCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    email = payload.email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    role = db.scalar(select(Role).where(Role.name == payload.role))
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role")
    new_user = User(
        role_id=role.id,
        full_name=payload.full_name.strip(),
        email=email,
        phone=(payload.phone or "").strip() or None,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(new_user)
    db.flush()
    db.add(
        AuditLog(
            user_id=user.id,
            action="CREATE_USER",
            entity_type="user",
            entity_id=str(new_user.id),
            payload={"email": email, "role": payload.role},
        )
    )
    db.commit()
    db.refresh(new_user)
    return {
        "id": new_user.id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "phone": new_user.phone,
        "role": role.name,
        "is_active": new_user.is_active,
    }


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    updates = payload.model_dump(exclude_unset=True)
    audit_payload = {}
    if "full_name" in updates and updates["full_name"] is not None:
        target.full_name = updates["full_name"].strip()
        audit_payload["full_name"] = target.full_name
    if "phone" in updates:
        target.phone = (updates["phone"] or "").strip() or None
        audit_payload["phone"] = target.phone
    if "is_active" in updates and updates["is_active"] is not None:
        target.is_active = updates["is_active"]
        audit_payload["is_active"] = target.is_active
    if "role" in updates and updates["role"] is not None:
        role = db.scalar(select(Role).where(Role.name == updates["role"]))
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role")
        target.role_id = role.id
        audit_payload["role"] = role.name
    if "password" in updates and updates["password"]:
        target.password_hash = hash_password(updates["password"])
        audit_payload["password"] = "updated"
    db.add(AuditLog(user_id=user.id, action="UPDATE_USER", entity_type="user", entity_id=str(target.id), payload=audit_payload))
    db.commit()
    db.refresh(target)
    return {
        "id": target.id,
        "full_name": target.full_name,
        "email": target.email,
        "phone": target.phone,
        "role": target.role.name if target.role else None,
        "is_active": target.is_active,
    }


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot remove the account you are logged in with")
    target.is_active = False
    db.add(
        AuditLog(
            user_id=user.id,
            action="DELETE_USER",
            entity_type="user",
            entity_id=str(target.id),
            payload={"soft_delete": True, "email": target.email},
        )
    )
    db.commit()
    return {"status": "deleted", "user_id": user_id}


@router.get("/health")
def health():
    return {"status": "ok"}
