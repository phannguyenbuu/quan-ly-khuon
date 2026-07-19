from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import List, Optional

# --- Transaction Log Schemas ---
class TransactionLogBase(BaseModel):
    status: str
    notes: Optional[str] = None
    technician: str

class TransactionLogCreate(TransactionLogBase):
    mold_code: str

class TransactionLogResponse(TransactionLogBase):
    id: int
    mold_code: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Error Log Schemas ---
class ErrorLogBase(BaseModel):
    description: str
    cause: Optional[str] = None
    solution: Optional[str] = None
    image_url: Optional[str] = None
    repair_deadline: Optional[date] = None
    supplier_pickup_status: Optional[str] = None

class ErrorLogCreate(ErrorLogBase):
    mold_code: str

class ErrorLogResponse(ErrorLogBase):
    id: int
    mold_code: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Mold Schemas ---
class MoldBase(BaseModel):
    code: str = Field(..., description="Unique mold code, e.g. MK-NAP-24")
    name: str = Field(..., description="Name of the production mold")
    supplier: str = Field(..., description="Supplier or manufacturer")
    import_date: date = Field(..., description="Date of warehousing/import")

class MoldCreate(MoldBase):
    pass

class MoldResponse(MoldBase):
    status: str
    acceptance_date: Optional[date] = None
    acceptance_feedback: Optional[str] = None
    acceptance_image_url: Optional[str] = None
    acceptance_attachment_url: Optional[str] = None
    acceptance_attachment_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- Mold File Schemas ---
class MoldFileResponse(BaseModel):
    id: int
    mold_code: str
    file_url: str
    file_name: str
    is_attachment: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Chi tiết khuôn bao gồm cả lịch sử giao dịch, nhật ký báo lỗi và danh sách hình ảnh/tệp đính kèm
class MoldDetailResponse(MoldResponse):
    transaction_logs: List[TransactionLogResponse] = []
    error_logs: List[ErrorLogResponse] = []
    files: List[MoldFileResponse] = []

    class Config:
        from_attributes = True

# --- Request Update Schemas ---
class MoldStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
    technician: str

class MoldAcceptReport(BaseModel):
    acceptance_feedback: str
    technician: str

# --- Zalo Notification Schemas ---
class ZaloNotificationResponse(BaseModel):
    id: int
    recipient: str
    message: str
    image_url: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
