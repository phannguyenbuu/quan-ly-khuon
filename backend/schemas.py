from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import List, Optional

# --- Mold Event Schemas (Jira-style Activity) ---
class MoldEventBase(BaseModel):
    type: str
    name: str
    content: Optional[str] = None
    tagged_staff: Optional[str] = None
    images: Optional[str] = None
    attachments: Optional[str] = None

class MoldEventResponse(MoldEventBase):
    id: int
    mold_code: str
    created_at: datetime
    updated_at: datetime

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

# Chi tiết khuôn bao gồm cả lịch sử các sự kiện liên kết (Jira-style events)
class MoldDetailResponse(MoldResponse):
    events: List[MoldEventResponse] = []

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

# --- Staff Schemas ---
class StaffBase(BaseModel):
    name: str
    role: str

class StaffCreate(StaffBase):
    pass

class StaffResponse(StaffBase):
    id: int

    class Config:
        from_attributes = True

# --- Status Schemas ---
class StatusBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None

class StatusCreate(StatusBase):
    pass

class StatusResponse(StatusBase):
    id: int

    class Config:
        from_attributes = True
