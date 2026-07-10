from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from datetime import date, datetime
from typing import Optional, List, Dict
from . import models, schemas

# --- Mold CRUD ---

def get_mold(db: Session, code: str) -> Optional[models.Mold]:
    return db.query(models.Mold).filter(models.Mold.code == code).first()

def get_molds(db: Session, search: Optional[str] = None, status: Optional[str] = None) -> List[models.Mold]:
    query = db.query(models.Mold)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                models.Mold.code.ilike(search_filter),
                models.Mold.name.ilike(search_filter),
                models.Mold.supplier.ilike(search_filter)
            )
        )
        
    if status and status != "Tất cả trạng thái":
        query = query.filter(models.Mold.status == status)
        
    # Sắp xếp theo ngày nhập mới nhất
    return query.order_by(models.Mold.import_date.desc()).all()

def create_mold(db: Session, mold: schemas.MoldCreate) -> models.Mold:
    db_mold = models.Mold(
        code=mold.code,
        name=mold.name,
        supplier=mold.supplier,
        import_date=mold.import_date,
        status="Khuôn nhập kho"
    )
    db.add(db_mold)
    db.commit()
    db.refresh(db_mold)
    
    # Ghi nhận lịch sử giao dịch đầu tiên
    create_transaction_log(
        db,
        mold_code=mold.code,
        status="Khuôn nhập kho",
        notes=f"Nhập kho thành công khuôn {mold.name} từ NCC {mold.supplier}",
        technician="Hệ thống"
    )
    
    return db_mold

def update_mold_status(db: Session, code: str, status: str, notes: Optional[str], technician: str) -> Optional[models.Mold]:
    db_mold = get_mold(db, code)
    if not db_mold:
        return None
    
    db_mold.status = status
    
    # Nếu chuyển đổi sang các trạng thái không còn lỗi, hoặc chuyển sang nghiệm thu, ta có thể giữ nguyên lịch sử lỗi cũ nhưng trạng thái hiển thị sẽ khác.
    db.commit()
    db.refresh(db_mold)
    
    # Ghi nhận lịch sử
    create_transaction_log(
        db,
        mold_code=code,
        status=status,
        notes=notes,
        technician=technician
    )
    
    return db_mold

def create_mold_error_log(db: Session, code: str, description: str, cause: Optional[str], solution: Optional[str], image_url: Optional[str], status: str, technician: str) -> Optional[models.Mold]:
    db_mold = get_mold(db, code)
    if not db_mold:
        return None
    
    # Tạo bản ghi nhật ký báo lỗi mới
    db_error = models.ErrorLog(
        mold_code=code,
        description=description,
        cause=cause,
        solution=solution,
        image_url=image_url
    )
    db.add(db_error)
    
    # Cập nhật trạng thái khuôn
    db_mold.status = status
    db.commit()
    db.refresh(db_mold)
    
    # Ghi nhận lịch sử giao dịch
    create_transaction_log(
        db,
        mold_code=code,
        status=status,
        notes=f"Báo lỗi chạy thử hỏng: {description}",
        technician=technician
    )
    
    return db_mold

def accept_mold(db: Session, code: str, feedback: str, technician: str) -> Optional[models.Mold]:
    db_mold = get_mold(db, code)
    if not db_mold:
        return None
    
    db_mold.status = "Khách duyệt (Sản xuất)"
    db_mold.acceptance_date = date.today()
    db_mold.acceptance_feedback = feedback
    
    db.commit()
    db.refresh(db_mold)
    
    # Ghi nhận lịch sử giao dịch
    create_transaction_log(
        db,
        mold_code=code,
        status="Khách duyệt (Sản xuất)",
        notes=f"Khách duyệt nghiệm thu: {feedback}",
        technician=technician
    )
    
    return db_mold

# --- Transaction Log CRUD ---

def create_transaction_log(db: Session, mold_code: str, status: str, notes: Optional[str], technician: str) -> models.TransactionLog:
    db_log = models.TransactionLog(
        mold_code=mold_code,
        status=status,
        notes=notes,
        technician=technician
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

# --- Dashboard & Statistics ---

def get_dashboard_stats(db: Session) -> Dict:
    total_molds = db.query(models.Mold).count()
    testing_molds = db.query(models.Mold).filter(models.Mold.status == "Thử khuôn").count()
    
    # Các trạng thái lỗi bao gồm 'Nhà máy tự sửa' và 'NCC đã lấy khuôn'
    error_molds = db.query(models.Mold).filter(
        models.Mold.status.in_(["Nhà máy tự sửa", "NCC đã lấy khuôn"])
    ).count()
    
    accepted_molds = db.query(models.Mold).filter(models.Mold.status == "Khách duyệt (Sản xuất)").count()
    
    # Phân loại trạng thái khuôn (cho biểu đồ Donut)
    status_counts = db.query(
        models.Mold.status, func.count(models.Mold.code)
    ).group_by(models.Mold.status).all()
    
    status_dist = {status: count for status, count in status_counts}
    
    # Phân bổ theo nhà cung cấp (cho biểu đồ Bar)
    supplier_counts = db.query(
        models.Mold.supplier, func.count(models.Mold.code)
    ).group_by(models.Mold.supplier).all()
    
    supplier_dist = {supplier: count for supplier, count in supplier_counts}
    
    return {
        "total": total_molds,
        "testing": testing_molds,
        "error": error_molds,
        "accepted": accepted_molds,
        "status_distribution": status_dist,
        "supplier_distribution": supplier_dist
    }

def delete_mold(db: Session, mold: models.Mold):
    db.delete(mold)
    db.commit()
