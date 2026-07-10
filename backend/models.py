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

    # Quan hệ với các bảng khác
    transaction_logs = relationship("TransactionLog", back_populates="mold", cascade="all, delete-orphan")
    error_logs = relationship("ErrorLog", back_populates="mold", cascade="all, delete-orphan")
    files = relationship("MoldFile", back_populates="mold", cascade="all, delete-orphan")

class TransactionLog(Base):
    __tablename__ = "transaction_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    mold_code = Column(String(50), ForeignKey("molds.code", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    technician = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    mold = relationship("Mold", back_populates="transaction_logs")

class ErrorLog(Base):
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    mold_code = Column(String(50), ForeignKey("molds.code", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    cause = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    image_url = Column(String(255), nullable=True)
    attachment_url = Column(String(255), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    mold = relationship("Mold", back_populates="error_logs")

class MoldFile(Base):
    __tablename__ = "mold_files"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    mold_code = Column(String(50), ForeignKey("molds.code", ondelete="CASCADE"), nullable=False)
    file_url = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    is_attachment = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    mold = relationship("Mold", back_populates="files")
