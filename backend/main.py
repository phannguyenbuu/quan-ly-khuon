import os
import shutil
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional

# Thêm thư mục gốc vào path để import các module con
import sys
PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from backend import database, models, schemas, crud

# Khởi tạo thư mục tải ảnh lỗi
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Tự động tạo bảng trong Database (nếu chưa tồn tại)
models.Base.metadata.create_all(bind=database.engine)

# Nạp dữ liệu cấu hình mặc định (Nhân sự & Trạng thái) nếu trống
db = database.SessionLocal()
try:
    if db.query(models.Staff).count() == 0:
        db.add_all([
            models.Staff(name="Kỹ thuật viên Sửa Chữa", role="Thợ khuôn"),
            models.Staff(name="Kỹ sư Đảm bảo Chất lượng (QC)", role="QC"),
            models.Staff(name="Quản lý Xưởng sản xuất", role="Quản lý")
        ])
        db.commit()
    if db.query(models.Status).count() == 0:
        db.add_all([
            models.Status(name="Khuôn nhập kho", description="Khai báo khuôn mới về xưởng sản xuất", color="import"),
            models.Status(name="Thử khuôn", description="Lắp khuôn lên máy chạy thử sản phẩm mẫu", color="trial"),
            models.Status(name="Gửi mẫu khách", description="Dập mẫu đạt và gửi mẫu đi cho khách duyệt", color="sample"),
            models.Status(name="Nhà máy tự sửa", description="Phát hiện lỗi chạy thử, thợ xưởng tự khắc phục", color="selfrepair"),
            models.Status(name="NCC đã lấy khuôn", description="Bàn giao lại cho NCC đem về bảo hành/sửa đổi", color="supplier"),
            models.Status(name="Khách duyệt (Sản xuất)", description="Khách ký duyệt chất lượng mẫu, đưa vào chạy hàng loạt", color="accepted")
        ])
        db.commit()
except Exception as e:
    print(f"Lỗi khi nạp dữ liệu mặc định: {e}")
finally:
    db.close()

app = FastAPI(
    title="Hệ thống Quản lý Khuôn API",
    version="1.1",
    description="API cho ứng dụng quản lý quy trình chạy thử và cập nhật sự cố khuôn mẫu"
)

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/db-status")
def get_db_status():
    """Kiểm tra tình trạng kết nối tới cơ sở dữ liệu PostgreSQL/SQLite."""
    try:
        db = database.SessionLocal()
        db.execute(database.text("SELECT 1"))
        db.close()
        return {
            "status": "connected",
            "database": database.DATABASE_URL.split("@")[-1] if "@" in database.DATABASE_URL else "SQLite/Local"
        }
    except Exception as e:
        return {"status": "disconnected", "error": str(e)}

@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(database.get_db)):
    """Lấy số liệu thống kê tổng hợp phục vụ màn hình Dashboard."""
    return crud.get_dashboard_stats(db)

@app.get("/api/molds", response_model=list[schemas.MoldResponse])
def read_molds(search: Optional[str] = None, status: Optional[str] = None, db: Session = Depends(database.get_db)):
    """Lấy danh sách khuôn sản xuất, hỗ trợ tìm kiếm theo Mã/Tên/NCC và lọc trạng thái."""
    return crud.get_molds(db, search=search, status=status)

@app.get("/api/molds/{code}", response_model=schemas.MoldDetailResponse)
def read_mold_detail(code: str, db: Session = Depends(database.get_db)):
    """Lấy thông tin chi tiết một khuôn mẫu kèm theo dòng thời gian lịch sử sự kiện liên kết."""
    db_mold = crud.get_mold(db, code)
    if not db_mold:
        raise HTTPException(status_code=404, detail="Không tìm thấy khuôn yêu cầu")
    return db_mold

@app.post("/api/molds", response_model=schemas.MoldResponse, status_code=status.HTTP_201_CREATED)
def create_new_mold(mold: schemas.MoldCreate, db: Session = Depends(database.get_db)):
    """Khai báo nhập kho khuôn mẫu sản xuất mới."""
    db_mold = crud.get_mold(db, mold.code)
    if db_mold:
        raise HTTPException(status_code=400, detail=f"Mã khuôn '{mold.code}' đã tồn tại trong hệ thống")
    return crud.create_mold(db, mold)

@app.post("/api/molds/{code}/edit")
def edit_mold_details(code: str, req: schemas.MoldEditRequest, db: Session = Depends(database.get_db)):
    """Chỉnh sửa thông tin chung của khuôn mẫu (mã khuôn, tên khuôn, nhà cung cấp)."""
    try:
        updated_mold = crud.update_mold_details(
            db, 
            old_code=code, 
            name=req.name.strip(), 
            supplier=req.supplier.strip(), 
            new_code=req.new_code.strip().upper()
        )
        return updated_mold
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống: {str(e)}")

@app.post("/api/molds/{code}/update", response_model=schemas.MoldResponse)
def update_existing_mold_status(code: str, req: schemas.MoldStatusUpdate, db: Session = Depends(database.get_db)):
    """Cập nhật tiến trình/trạng thái mới cho khuôn."""
    db_mold = crud.update_mold_status(db, code, req.status, req.notes, req.technician)
    if not db_mold:
        raise HTTPException(status_code=404, detail="Không tìm thấy khuôn yêu cầu")
    return db_mold

@app.post("/api/molds/{code}/issue", response_model=schemas.MoldResponse)
def report_mold_issue(
    code: str,
    description: str = Form(...),
    cause: Optional[str] = Form(None),
    solution: Optional[str] = Form(None),
    status: str = Form(...),
    technician: str = Form(...),
    repair_deadline: Optional[str] = Form(None),
    supplier_pickup_status: Optional[str] = Form(None),
    error_image: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    """Báo cáo sự cố kỹ thuật của khuôn trong quá trình chạy thử (Nhà máy tự sửa hoặc NCC lấy đi)."""
    deadline_date = None
    if repair_deadline:
        try:
            deadline_date = date.fromisoformat(repair_deadline)
        except ValueError:
            pass
            
    saved_image_url = None
    if error_image and error_image.filename:
        file_path = os.path.join(UPLOAD_DIR, error_image.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(error_image.file, buffer)
        saved_image_url = f"/uploads/{error_image.filename}"

    db_mold = crud.create_mold_issue_event(
        db,
        code=code,
        description=description,
        cause=cause,
        solution=solution,
        image_url=saved_image_url,
        status=status,
        technician=technician,
        repair_deadline=deadline_date,
        supplier_pickup_status=supplier_pickup_status
    )
    
    if not db_mold:
        raise HTTPException(status_code=404, detail="Không tìm thấy khuôn yêu cầu")
    return db_mold

@app.post("/api/molds/{code}/accept", response_model=schemas.MoldResponse)
def accept_mold_delivery(
    code: str,
    acceptance_feedback: str = Form(...),
    technician: str = Form(...),
    acceptance_image: Optional[UploadFile] = File(None),
    acceptance_attachment: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    """Nghiệm thu đạt chất lượng sản phẩm chạy thử, đưa khuôn vào sản xuất đại trà."""
    saved_image_url = None
    if acceptance_image and acceptance_image.filename:
        file_path = os.path.join(UPLOAD_DIR, acceptance_image.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(acceptance_image.file, buffer)
        saved_image_url = f"/uploads/{acceptance_image.filename}"

    saved_attach_url = None
    saved_attach_name = None
    if acceptance_attachment and acceptance_attachment.filename:
        file_path = os.path.join(UPLOAD_DIR, acceptance_attachment.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(acceptance_attachment.file, buffer)
        saved_attach_url = f"/uploads/{acceptance_attachment.filename}"
        saved_attach_name = acceptance_attachment.filename

    db_mold = crud.accept_mold(
        db,
        code=code,
        feedback=acceptance_feedback,
        technician=technician,
        image_url=saved_image_url,
        attachment_url=saved_attach_url,
        attachment_name=saved_attach_name
    )
    if not db_mold:
        raise HTTPException(status_code=404, detail="Không tìm thấy khuôn yêu cầu")
    return db_mold

@app.delete("/api/molds/{code}")
def delete_mold_from_db(code: str, db: Session = Depends(database.get_db)):
    """Xóa bỏ khuôn mẫu hoàn toàn khỏi hệ thống dữ liệu."""
    db_mold = crud.get_mold(db, code)
    if not db_mold:
        raise HTTPException(status_code=404, detail="Không tìm thấy khuôn yêu cầu")
    crud.delete_mold(db, db_mold)
    return {"detail": "Đã xóa khuôn thành công"}

@app.post("/api/molds/{code}/files")
def upload_mold_files(
    code: str,
    files: List[UploadFile] = File(...),
    is_attachment: bool = Form(False),
    db: Session = Depends(database.get_db)
):
    """Tải lên nhiều tệp tin (hình ảnh / tài liệu đính kèm) cho khuôn mẫu và ghi nhận sự kiện."""
    db_mold = crud.get_mold(db, code)
    if not db_mold:
        raise HTTPException(status_code=404, detail="Không tìm thấy khuôn")
    
    uploaded_images = []
    uploaded_docs = []
    
    for file in files:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_url = f"/uploads/{file.filename}"
        if is_attachment:
            uploaded_docs.append({"name": file.filename, "url": file_url})
        else:
            uploaded_images.append(file_url)
            
    import json
    images_str = ",".join(uploaded_images) if uploaded_images else None
    docs_json = json.dumps(uploaded_docs) if uploaded_docs else None
    
    crud.create_mold_event(
        db,
        mold_code=code,
        event_type="file_upload",
        name="Tải lên tài liệu" if is_attachment else "Thêm ảnh vào gallery",
        content=f"Đã thêm {len(files)} tệp tin mới.",
        tagged_staff="Hệ thống",
        images=images_str,
        attachments=docs_json
    )
    
    return {"detail": "Tải lên thành công"}

@app.delete("/api/files/{file_id}")
def delete_mold_file(file_id: int, db: Session = Depends(database.get_db)):
    """Xóa bỏ tài liệu đính kèm hoặc hình ảnh dựa trên ID sự kiện tải lên."""
    db_event = db.query(models.MoldEvent).filter(models.MoldEvent.id == file_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp tin")
    
    import json
    # Xóa ảnh vật lý
    if db_event.images:
        for img in db_event.images.split(','):
            file_path = os.path.join(PARENT_DIR, img.lstrip('/'))
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass
    # Xóa file tài liệu vật lý
    if db_event.attachments:
        try:
            parsed = json.loads(db_event.attachments)
            for f in parsed:
                file_path = os.path.join(PARENT_DIR, f["url"].lstrip('/'))
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except:
                        pass
        except:
            pass
            
    db.delete(db_event)
    db.commit()
    return {"detail": "Đã xóa tệp tin thành công"}

@app.get("/api/staff", response_model=list[schemas.StaffResponse])
def get_staff(db: Session = Depends(database.get_db)):
    return db.query(models.Staff).all()

@app.get("/api/statuses", response_model=list[schemas.StatusResponse])
def get_statuses(db: Session = Depends(database.get_db)):
    return db.query(models.Status).all()

# --- Phục vụ file tĩnh ---

# Phục vụ thư mục tệp tin hình ảnh tải lên
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Phục vụ giao diện Frontend (Hỗ trợ cả dev/test hoặc production build dist)
frontend_path = os.path.join(PARENT_DIR, "frontend", "dist")
if not os.path.exists(frontend_path):
    frontend_path = os.path.join(PARENT_DIR, "frontend")

if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    print(f"Cảnh báo: Thư mục frontend không tồn tại tại {frontend_path}. API hoạt động ở chế độ không giao diện.")
