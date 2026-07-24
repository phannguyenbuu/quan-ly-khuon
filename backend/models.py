from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Mold(Base):
    __tablename__ = "molds"

    code = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    supplier = Column(String(100), nullable=False)
    import_date = Column(Date, nullable=False)
    status = Column(String(50), nullable=False)
    
    # Nghiệm thu (nếu có)
    acceptance_date = Column(Date, nullable=True)
    acceptance_feedback = Column(Text, nullable=True)
    acceptance_image_url = Column(String(255), nullable=True)
    acceptance_attachment_url = Column(String(255), nullable=True)
    acceptance_attachment_name = Column(String(255), nullable=True)

    # Vùng liên kết sự kiện (Jira-style Activity Log)
    events = relationship("MoldEvent", back_populates="mold", cascade="all, delete-orphan")

class MoldEvent(Base):
    __tablename__ = "mold_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    mold_code = Column(String(50), ForeignKey("molds.code", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), nullable=False)  # 'transaction' (cập nhật trạng thái) | 'issue' (sự cố kỹ thuật) | 'acceptance' (nghiệm thu) | 'file_upload' (tải lên tài liệu)
    name = Column(String(100), nullable=False)  # Tên sự kiện (ví dụ: 'Thử khuôn', 'Nhà máy tự sửa', 'Báo lỗi')
    content = Column(Text, nullable=True)  # Nội dung chi tiết (ví dụ: mô tả lỗi, nguyên nhân, giải pháp, ý kiến khách)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Staff liên quan (được tag vào)
    tagged_staff = Column(Text, nullable=True)  # Chuỗi tên staff ngăn cách bởi dấu phẩy, ví dụ: "Nguyễn Văn A"
    
    # File đính kèm lưu dưới dạng chuỗi ngăn cách bởi dấu phẩy
    images = Column(Text, nullable=True)  # Danh sách URL ảnh: "/uploads/img1.jpg,/uploads/img2.jpg"
    attachments = Column(Text, nullable=True)  # Tệp đính kèm dạng JSON string: '[{"name": "file.pdf", "url": "/uploads/file.pdf"}]'

    mold = relationship("Mold", back_populates="events")

class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False)  # 'Thợ khuôn' | 'QC' | 'Quản lý'

class Status(Base):
    __tablename__ = "statuses"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(50), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(50), nullable=True)
