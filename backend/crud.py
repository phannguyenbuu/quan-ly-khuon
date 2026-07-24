from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text
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
        
    return query.order_by(models.Mold.import_date.desc()).all()

# --- Mold Event CRUD (Jira-style Activity) ---

def create_mold_event(
    db: Session,
    mold_code: str,
    event_type: str,
    name: str,
    content: Optional[str] = None,
    tagged_staff: Optional[str] = None,
    images: Optional[str] = None,
    attachments: Optional[str] = None
) -> models.MoldEvent:
    db_event = models.MoldEvent(
        mold_code=mold_code,
        type=event_type,
        name=name,
        content=content,
        tagged_staff=tagged_staff,
        images=images,
        attachments=attachments
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

# --- Create & Update Molds ---

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
    
    # Ghi nhận sự kiện đầu tiên
    create_mold_event(
        db,
        mold_code=mold.code,
        event_type="transaction",
        name="Khuôn nhập kho",
        content=f"Nhập kho thành công khuôn <strong>{mold.name}</strong> từ NCC <em>{mold.supplier}</em>",
        tagged_staff="Hệ thống"
    )
    
    return db_mold

def update_mold_details(db: Session, old_code: str, name: str, supplier: str, new_code: str) -> models.Mold:
    db_mold = get_mold(db, old_code)
    if not db_mold:
        raise ValueError("Không tìm thấy khuôn mẫu")
        
    if old_code != new_code:
        # Check if new code already exists
        exists = get_mold(db, new_code)
        if exists:
            raise ValueError(f"Mã khuôn '{new_code}' đã tồn tại")
            
        # Update references manually in events table to prevent foreign key errors
        db.execute(text("UPDATE mold_events SET mold_code = :new_code WHERE mold_code = :old_code"), 
                   {"new_code": new_code, "old_code": old_code})
        db.commit()
        
        # Now update the primary key and general info
        db.execute(text("UPDATE molds SET code = :new_code, name = :name, supplier = :supplier WHERE code = :old_code"), 
                   {"new_code": new_code, "name": name, "supplier": supplier, "old_code": old_code})
        db.commit()
        return get_mold(db, new_code)
    else:
        db_mold.name = name
        db_mold.supplier = supplier
        db.commit()
        db.refresh(db_mold)
        return db_mold

def update_mold_status(db: Session, code: str, status: str, notes: Optional[str], technician: str) -> Optional[models.Mold]:
    db_mold = get_mold(db, code)
    if not db_mold:
        return None
    
    db_mold.status = status
    db.commit()
    db.refresh(db_mold)
    
    # Ghi nhận sự kiện chuyển đổi trạng thái
    create_mold_event(
        db,
        mold_code=code,
        event_type="transaction",
        name=status,
        content=notes,
        tagged_staff=technician
    )
    
    return db_mold

def create_mold_issue_event(
    db: Session,
    code: str,
    description: str,
    cause: Optional[str],
    solution: Optional[str],
    image_url: Optional[str],
    status: str,
    technician: str,
    repair_deadline: Optional[date] = None,
    supplier_pickup_status: Optional[str] = None
) -> Optional[models.Mold]:
    db_mold = get_mold(db, code)
    if not db_mold:
        return None
    
    # Cập nhật trạng thái khuôn
    db_mold.status = status
    db.commit()
    db.refresh(db_mold)
    
    # Định dạng nội dung sự cố kỹ thuật bằng HTML
    content_parts = [f"<strong>Mô tả sự cố:</strong> {description}"]
    if cause:
        content_parts.append(f"<strong>Nguyên nhân:</strong> {cause}")
    if solution:
        content_parts.append(f"<strong>Giải pháp:</strong> {solution}")
    if repair_deadline:
        content_parts.append(f"<strong>Hạn chót sửa chữa:</strong> <span class='text-danger'>{repair_deadline.strftime('%d/%m/%Y')}</span>")
    if supplier_pickup_status:
        content_parts.append(f"<strong>Tình trạng NCC:</strong> {supplier_pickup_status}")
    
    full_content = "<br/>".join(content_parts)
    
    # Ghi nhận sự kiện lỗi kỹ thuật (issue)
    create_mold_event(
        db,
        mold_code=code,
        event_type="issue",
        name=f"Báo lỗi: {status}",
        content=full_content,
        tagged_staff=technician,
        images=image_url
    )
    
    return db_mold

def accept_mold(
    db: Session,
    code: str,
    feedback: str,
    technician: str,
    image_url: Optional[str] = None,
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None
) -> Optional[models.Mold]:
    db_mold = get_mold(db, code)
    if not db_mold:
        return None
    
    db_mold.status = "Khách duyệt (Sản xuất)"
    db_mold.acceptance_date = date.today()
    db_mold.acceptance_feedback = feedback
    db_mold.acceptance_image_url = image_url
    db_mold.acceptance_attachment_url = attachment_url
    db_mold.acceptance_attachment_name = attachment_name
    
    db.commit()
    db.refresh(db_mold)
    
    import json
    attachments_json = None
    if attachment_url and attachment_name:
        attachments_json = json.dumps([{"name": attachment_name, "url": attachment_url}])
    
    # Ghi nhận sự kiện nghiệm thu (acceptance)
    create_mold_event(
        db,
        mold_code=code,
        event_type="acceptance",
        name="Khách duyệt (Sản xuất)",
        content=f"Khách duyệt nghiệm thu: <span class='text-success'><strong>{feedback}</strong></span>",
        tagged_staff=technician,
        images=image_url,
        attachments=attachments_json
    )
    
    return db_mold

def delete_mold(db: Session, mold: models.Mold):
    db.delete(mold)
    db.commit()

# --- Dashboard Statistics ---

def get_dashboard_stats(db: Session) -> Dict:
    total_molds = db.query(models.Mold).count()
    testing_molds = db.query(models.Mold).filter(models.Mold.status == "Thử khuôn").count()
    
    error_molds = db.query(models.Mold).filter(
        models.Mold.status.in_(["Nhà máy tự sửa", "NCC đã lấy khuôn"])
    ).count()
    
    accepted_molds = db.query(models.Mold).filter(models.Mold.status == "Khách duyệt (Sản xuất)").count()
    
    status_counts = db.query(
        models.Mold.status, func.count(models.Mold.code)
    ).group_by(models.Mold.status).all()
    
    status_dist = {status: count for status, count in status_counts}
    
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
