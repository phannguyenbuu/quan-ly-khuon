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

    # Gửi Zalo thông báo cho Quản lý nắm tình hình chung
    create_zalo_notification(
        db,
        recipient="Quản lý",
        message=f"[CSDL TẬP TRUNG] Nhập kho khuôn mẫu mới thành công. Mã khuôn: {mold.code} | Tên khuôn: {mold.name} | Nhà cung cấp: {mold.supplier} | Ngày nhập: {mold.import_date}."
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

    # Gửi thông báo Zalo tương ứng
    if status == "Thử khuôn":
        create_zalo_notification(
            db,
            recipient="QC",
            message=f"[QC THỬ KHUÔN] Khuôn {code} ({db_mold.name}) bắt đầu tiến hành thử nghiệm chạy mẫu. Kỹ thuật viên phụ trách: {technician}. Ghi chú thử: {notes or 'Không có ghi chú'}."
        )
        create_zalo_notification(
            db,
            recipient="Quản lý",
            message=f"[TIẾN TRÌNH] Cập nhật: Khuôn {code} chuyển sang trạng thái 'Thử khuôn'. Kỹ thuật viên: {technician}."
        )
    elif status == "Gửi mẫu khách":
        create_zalo_notification(
            db,
            recipient="Quản lý",
            message=f"[TIẾN TRÌNH] Cập nhật: Khuôn {code} ({db_mold.name}) đã dập mẫu đạt và gửi mẫu thử lần 1 cho khách hàng duyệt. Kỹ thuật viên: {technician}."
        )
    
    return db_mold

def create_mold_error_log(
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
    
    # Tạo bản ghi nhật ký báo lỗi mới
    db_error = models.ErrorLog(
        mold_code=code,
        description=description,
        cause=cause,
        solution=solution,
        image_url=image_url,
        repair_deadline=repair_deadline,
        supplier_pickup_status=supplier_pickup_status
    )
    db.add(db_error)
    
    # Cập nhật trạng thái khuôn
    db_mold.status = status
    db.commit()
    db.refresh(db_mold)
    
    # Tạo ghi chú lịch sử giao dịch chi tiết
    notes_parts = [f"Báo lỗi chạy thử hỏng: {description}"]
    if repair_deadline:
        notes_parts.append(f"Hạn chót: {repair_deadline.strftime('%d/%m/%Y')}")
    if supplier_pickup_status:
        notes_parts.append(f"Tình trạng NCC: {supplier_pickup_status}")
    notes_str = ". ".join(notes_parts)

    # Ghi nhận lịch sử giao dịch
    create_transaction_log(
        db,
        mold_code=code,
        status=status,
        notes=notes_str,
        technician=technician
    )

    # Gửi thông báo Zalo dựa trên chế độ tự sửa hoặc gửi nhà cung cấp
    deadline_str = repair_deadline.strftime("%d/%m/%Y") if repair_deadline else "Không có"
    if status == "Nhà máy tự sửa":
        create_zalo_notification(
            db,
            recipient="Thợ khuôn",
            message=f"[THỢ KHUÔN - PHÂN CÔNG] Yêu cầu tự sửa chữa sự cố khuôn {code} ({db_mold.name}). Mô tả sự cố: {description}. Nguyên nhân: {cause or 'Chưa xác định'}. Hạn chót hoàn thành (Deadline): {deadline_str}. QC báo lỗi: {technician}.",
            image_url=image_url
        )
        create_zalo_notification(
            db,
            recipient="Quản lý",
            message=f"[CẢNH BÁO SỰ CỐ] Khuôn {code} lỗi: {description}. Nhà máy đã phân công thợ khuôn sửa chữa. Hạn chót: {deadline_str}."
        )
    elif status == "NCC đã lấy khuôn":
        create_zalo_notification(
            db,
            recipient="Quản lý",
            message=f"[NCC BẢO HÀNH] Bàn giao khuôn {code} ({db_mold.name}) cho NCC {db_mold.supplier}. Tình trạng NCC: {supplier_pickup_status or 'Không xác định'}. Hạn chót trả hàng: {deadline_str}. Lỗi kỹ thuật: {description}."
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
    
    # Ghi nhận lịch sử giao dịch
    create_transaction_log(
        db,
        mold_code=code,
        status="Khách duyệt (Sản xuất)",
        notes=f"Khách duyệt nghiệm thu: {feedback}",
        technician=technician
      )

    # Gửi Zalo thông báo
    create_zalo_notification(
        db,
        recipient="Quản lý",
        message=f"[NGHIỆM THU - PHÊ DUYỆT] Khách hàng đã nghiệm thu đạt khuôn {code} ({db_mold.name}) và đưa vào sản xuất đại trà. Ý kiến: {feedback}.",
        image_url=image_url
    )
    create_zalo_notification(
        db,
        recipient="Thợ khuôn",
        message=f"[THÔNG BÁO] Khuôn mẫu {code} ({db_mold.name}) do bạn phụ trách/chỉnh sửa đã được khách hàng duyệt nghiệm thu thành công!"
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

def create_zalo_notification(db: Session, recipient: str, message: str, image_url: Optional[str] = None) -> models.ZaloNotification:
    db_notif = models.ZaloNotification(
        recipient=recipient,
        message=message,
        image_url=image_url
    )
    db.add(db_notif)
    db.commit()
    db.refresh(db_notif)
    
    # In ra console để mô phỏng và kiểm tra
    print(f"\n📢 [ZALO NOTIFICATION SYSTEM] Gửi tới: {recipient}")
    print(f"💬 Nội dung: {message}")
    if image_url:
        print(f"🖼️ Hình ảnh đính kèm: {image_url}")
    print("----------------------------------------\n")

    # Gửi tin nhắn thực qua zalo-gateway nếu được cấu hình
    import os
    import urllib.request
    import json
    
    gateway_url = os.getenv("ZALO_GATEWAY_URL", "").strip()
    if gateway_url:
        thread_id = None
        thread_type = "user"
        if recipient == "Quản lý":
            thread_id = os.getenv("ZALO_THREAD_QUAN_LY")
            thread_type = os.getenv("ZALO_THREAD_TYPE_QUAN_LY", "user")
        elif recipient == "Thợ khuôn":
            thread_id = os.getenv("ZALO_THREAD_THO_KHUON")
            thread_type = os.getenv("ZALO_THREAD_TYPE_THO_KHUON", "user")
        elif recipient == "QC":
            thread_id = os.getenv("ZALO_THREAD_QC")
            thread_type = os.getenv("ZALO_THREAD_TYPE_QC", "user")
            
        if thread_id:
            try:
                payload = {
                    "thread_id": thread_id,
                    "thread_type": thread_type,
                    "content": message
                }
                
                # Nếu có hình ảnh, thêm thông số ảnh (hỗ trợ cả link tuyệt đối và tương đối)
                if image_url:
                    full_image_url = image_url
                    if image_url.startswith("/"):
                        app_url = os.getenv("APP_PUBLIC_URL", "http://31.97.76.62:8001")
                        full_image_url = f"{app_url.rstrip('/')}{image_url}"
                    payload["image_url"] = full_image_url
                
                endpoint = "/api/send" if "8020" in gateway_url or "api" in gateway_url else "/messages/send"
                req_url = f"{gateway_url.rstrip('/')}{endpoint}" if not gateway_url.endswith(endpoint) else gateway_url
                
                req_headers = {
                    "Content-Type": "application/json",
                    "X-Zalo-Connection-Key": os.getenv("ZALO_CONNECTION_KEY", "default")
                }
                
                req = urllib.request.Request(
                    req_url, 
                    data=json.dumps(payload).encode("utf-8"), 
                    headers=req_headers,
                    method="POST"
                )
                
                # Gọi API với timeout ngắn để tránh chặn luồng chính
                with urllib.request.urlopen(req, timeout=5) as response:
                    res_body = response.read().decode("utf-8")
                    print(f"🚀 [ZALO GATEWAY SUCCESS] Response: {res_body}")
            except Exception as e:
                print(f"⚠️ [ZALO GATEWAY ERROR] Gửi tin thất bại: {e}")
                
    return db_notif
