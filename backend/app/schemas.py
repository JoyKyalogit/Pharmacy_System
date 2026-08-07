from datetime import date, datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=128)


class DeskLoginRequest(BaseModel):
    pin: str = Field(..., min_length=8, max_length=64)


class StaffPinLoginRequest(BaseModel):
    user_id: int
    pin: str = Field(..., min_length=4, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=4, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class DrugCreate(BaseModel):
    name: str
    sku: str
    category: str | None = None
    unit: str
    purchase_unit: str = "pack"
    units_per_purchase: int = Field(1, ge=1)
    reorder_level: int = Field(0, ge=0)
    is_prescription_required: bool = False


class DrugUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    unit: str | None = None
    purchase_unit: str | None = None
    units_per_purchase: int | None = Field(None, ge=1)
    reorder_level: int | None = Field(None, ge=0)
    is_prescription_required: bool | None = None
    is_active: bool | None = None


class BatchCreate(BaseModel):
    drug_id: int
    supplier_id: int | None = None
    batch_no: str
    expiry_date: date
    # Either provide quantity_received in dispense units OR quantity_received_purchase in purchase units.
    quantity_received: int | None = Field(None, gt=0)
    quantity_received_purchase: int | None = Field(None, gt=0)
    unit_cost: float = Field(..., ge=0)
    selling_price: float = Field(..., ge=0)


class BatchUpdate(BaseModel):
    batch_no: str | None = None
    expiry_date: date | None = None
    quantity_available: int | None = Field(None, ge=0)
    unit_cost: float | None = Field(None, ge=0)
    selling_price: float | None = Field(None, ge=0)


class SaleItemIn(BaseModel):
    drug_id: int
    batch_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount: float = Field(0, ge=0)


class SaleCreate(BaseModel):
    sale_type: str
    customer_name: str | None = None
    prescription_ref: str | None = None
    kra_pin: str | None = None
    etr_serial: str | None = None
    payment_method: str
    items: list[SaleItemIn]


class SaleCreateResponse(BaseModel):
    sale_id: int
    receipt_no: str
    subtotal: float
    discount_total: float
    tax_total: float
    grand_total: float
    payment_method: str
    kra_pin: str | None = None
    etr_serial: str | None = None
    etr_status: str
    created_at: datetime


class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=4, max_length=128)
    role: str = Field(..., pattern="^(Admin|Pharmacist|Cashier)$")
    phone: str | None = Field(None, max_length=30)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=150)
    password: str | None = Field(None, min_length=4, max_length=128)
    role: str | None = Field(None, pattern="^(Admin|Pharmacist|Cashier)$")
    phone: str | None = Field(None, max_length=30)
    is_active: bool | None = None
