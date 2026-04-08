from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.dependencies import get_current_user, require_roles
from app.models import AuditLog, Batch, Drug, Role, Sale, SaleItem, User
from app.schemas import BatchCreate, DrugCreate, DrugUpdate, LoginRequest, SaleCreate, SaleCreateResponse, TokenResponse

router = APIRouter(prefix="/api/v1")


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
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


@router.get("/stock/levels")
def stock_levels(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Pharmacist", "Cashier"))):
    rows = db.execute(
        select(
            Drug.id,
            Drug.name,
            Drug.unit,
            Drug.purchase_unit,
            Drug.units_per_purchase,
            func.coalesce(func.sum(Batch.quantity_available), 0).label("total"),
            func.min(Batch.selling_price).label("unit_price"),
            Drug.reorder_level,
            func.min(Batch.expiry_date).label("nearest_expiry"),
        )
        .join(Batch, Batch.drug_id == Drug.id, isouter=True)
        .where(Drug.is_active.is_(True))
        .group_by(Drug.id)
    ).all()
    return [
        {
            "drug_id": r.id,
            "drug_name": r.name,
            "unit": r.unit,
            "purchase_unit": r.purchase_unit,
            "units_per_purchase": int(r.units_per_purchase or 1),
            "total_quantity": int(r.total or 0),
            "unit_price": float(r.unit_price or 0),
            "reorder_level": r.reorder_level,
            "is_low_stock": int(r.total or 0) <= r.reorder_level,
            "nearest_expiry": r.nearest_expiry,
        }
        for r in rows
    ]


@router.get("/reports/sales-today")
def sales_today(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Pharmacist"))):
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
    user: User = Depends(require_roles("Admin", "Pharmacist")),
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
    items = db.execute(
        select(
            Drug.id.label("drug_id"),
            Drug.name.label("drug_name"),
            func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SaleItem.line_total), 0).label("amount"),
        )
        .join(SaleItem, SaleItem.drug_id == Drug.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.created_at >= start, Sale.created_at <= end)
        .group_by(Drug.id, Drug.name)
        .order_by(func.coalesce(func.sum(SaleItem.quantity), 0).desc())
    ).all()
    return {
        "range": {"start_date": str(start_date), "end_date": str(end_date)},
        "sales_count": int(totals.sales_count or 0),
        "gross_revenue": float(totals.gross_revenue or 0),
        "items": [
            {
                "drug_id": int(r.drug_id),
                "drug_name": r.drug_name,
                "quantity": int(r.quantity or 0),
                "amount": float(r.amount or 0),
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
        batches = db.scalars(
            select(Batch)
            .where(Batch.drug_id == item.drug_id, Batch.expiry_date >= date.today(), Batch.quantity_available > 0)
            .order_by(Batch.expiry_date.asc())
            .with_for_update()
        ).all()
        available = sum(b.quantity_available for b in batches)
        if available < needed:
            raise HTTPException(status_code=400, detail=f"INSUFFICIENT_STOCK for drug_id={item.drug_id}")
        for batch in batches:
            if needed <= 0:
                break
            take = min(needed, batch.quantity_available)
            batch.quantity_available -= take
            line_total = (item.unit_price * take) - item.discount
            subtotal += item.unit_price * take
            discount_total += item.discount
            sale_lines.append(
                {"drug_id": item.drug_id, "batch_id": batch.id, "quantity": take, "unit_price": item.unit_price, "discount_amount": item.discount, "line_total": line_total}
            )
            needed -= take

    grand_total = subtotal - discount_total
    receipt_no = f"RCPT-{datetime.now().strftime('%Y%m%d%H%M%S')}"
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
def low_stock_report(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Pharmacist"))):
    rows = db.execute(
        select(Drug.id, Drug.name, func.coalesce(func.sum(Batch.quantity_available), 0).label("qty"), Drug.reorder_level)
        .join(Batch, Batch.drug_id == Drug.id, isouter=True)
        .group_by(Drug.id)
        .having(func.coalesce(func.sum(Batch.quantity_available), 0) <= Drug.reorder_level)
    ).all()
    return [{"drug_id": r.id, "drug_name": r.name, "current_quantity": int(r.qty or 0), "reorder_level": r.reorder_level} for r in rows]


@router.get("/health")
def health():
    return {"status": "ok"}
