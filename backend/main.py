import os
import sys
import uuid
import shutil
from datetime import date
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text

# Thêm thư mục gốc vào path để uvicorn/python tìm thấy package backend
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from backend import database, models, schemas, crud

# Khởi tạo thư mục tải ảnh lỗi
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Tự động tạo bảng trong Database (nếu chưa tồn tại)
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="Hệ thống Quản lý Khuôn API",
    version="1.1",
    description="API cho ứng dụng quản lý quy trình chạy thử và cập nhật lỗi khuôn mẫu"
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

# --- API Endpoints ---

@app.get("/api/db-status")
def get_db_status(db: Session = Depends(database.get_db)):
    """Kiểm tra tình trạng kết nối tới cơ sở dữ liệu PostgreSQL/SQLite."""
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "connected",
            "database": database.DATABASE_URL.split("@")[-1] if "@" in database.DATABASE_URL else "SQLite/Local"
        }
    except Exception as e:
        return {
            "status": "disconnected",
            "error": str(e)
        }

@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(database.get_db)):
    """Lấy dữ liệu thống kê cho Dashboard và biểu đồ."""
    return crud.get_dashboard_stats(db)

@app.get("/api/molds", response_model=list[schemas.MoldResponse])
def get_molds(
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    """Lấy danh sách khuôn mẫu, hỗ trợ tìm kiếm và lọc trạng thái."""
    return crud.get_molds(db, search=search, status=status)

@app.get("/api/molds/{code}", response_model=schemas.MoldDetailResponse)
def get_mold_detail(code: str, db: Session = Depends(database.get_db)):
    """Lấy chi tiết hồ sơ kỹ thuật, lịch sử giao dịch và lỗi của một khuôn."""
    db_mold = crud.get_mold(db, code)
    if not db_mold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khuôn với mã: {code}"
        )
    return db_mold

@app.post("/api/molds", response_model=schemas.MoldResponse, status_code=status.HTTP_201_CREATED)
def create_mold(mold: schemas.MoldCreate, db: Session = Depends(database.get_db)):
    """Khai báo nhập kho khuôn mới (Khởi tạo quy trình)."""
    db_mold = crud.get_mold(db, mold.code)
    if db_mold:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã khuôn '{mold.code}' đã tồn tại trong hệ thống."
        )
    return crud.create_mold(db, mold)

@app.post("/api/molds/{code}/update", response_model=schemas.MoldResponse)
def update_mold_status(
    code: str,
    update_data: schemas.MoldStatusUpdate,
    db: Session = Depends(database.get_db)
):
    """Cập nhật trạng thái và ghi nhận lịch sử giao dịch thông thường."""
    db_mold = crud.update_mold_status(
        db,
        code=code,
        status=update_data.status,
        notes=update_data.notes,
        technician=update_data.technician
    )
    if not db_mold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khuôn với mã: {code}"
        )
    return db_mold

@app.post("/api/molds/{code}/error", response_model=schemas.MoldResponse)
def report_mold_error(
    code: str,
    description: str = Form(...),
    cause: Optional[str] = Form(None),
    solution: Optional[str] = Form(None),
    status: str = Form(...),  # Thường là 'Nhà máy tự sửa' hoặc 'NCC đã lấy khuôn'
    technician: str = Form(...),
    image: Optional[UploadFile] = File(None),
    repair_deadline: Optional[str] = Form(None),
    supplier_pickup_status: Optional[str] = Form(None),
    db: Session = Depends(database.get_db)
):
    """Ghi nhận lỗi kỹ thuật chạy thử khuôn và tải ảnh lỗi lên máy chủ."""
    image_url = None
    if image and image.filename:
        # Tạo tên file duy nhất tránh trùng lặp tệp
        file_ext = os.path.splitext(image.filename)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        filepath = os.path.join(UPLOAD_DIR, unique_filename)
        
        try:
            with open(filepath, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            # Lưu đường dẫn tương đối phục vụ qua API tĩnh
            image_url = f"/uploads/{unique_filename}"
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi khi lưu ảnh tải lên: {str(e)}"
            )

    parsed_deadline = None
    if repair_deadline:
        try:
            from datetime import datetime
            parsed_deadline = datetime.strptime(repair_deadline, "%Y-%m-%d").date()
        except Exception:
            pass

    db_mold = crud.create_mold_error_log(
        db,
        code=code,
        description=description,
        cause=cause,
        solution=solution,
        image_url=image_url,
        status=status,
        technician=technician,
        repair_deadline=parsed_deadline,
        supplier_pickup_status=supplier_pickup_status
    )
    if not db_mold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khuôn với mã: {code}"
        )
    return db_mold

@app.post("/api/molds/{code}/accept", response_model=schemas.MoldResponse)
def accept_mold(
    code: str,
    acceptance_feedback: str = Form(...),
    technician: str = Form(...),
    image: Optional[UploadFile] = File(None),
    attachment: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    """Ký duyệt nghiệm thu khuôn mẫu từ phía khách hàng duyệt kèm ảnh và tài liệu đính kèm."""
    image_url = None
    if image and image.filename:
        file_ext = os.path.splitext(image.filename)[1]
        unique_filename = f"accept_{uuid.uuid4().hex}{file_ext}"
        filepath = os.path.join(UPLOAD_DIR, unique_filename)
        try:
            with open(filepath, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            image_url = f"/uploads/{unique_filename}"
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi khi lưu ảnh nghiệm thu: {str(e)}"
            )

    attachment_url = None
    attachment_name = None
    if attachment and attachment.filename:
        file_ext = os.path.splitext(attachment.filename)[1]
        unique_filename = f"accept_doc_{uuid.uuid4().hex}{file_ext}"
        filepath = os.path.join(UPLOAD_DIR, unique_filename)
        try:
            with open(filepath, "wb") as buffer:
                shutil.copyfileobj(attachment.file, buffer)
            attachment_url = f"/uploads/{unique_filename}"
            attachment_name = attachment.filename
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi khi lưu tài liệu nghiệm thu: {str(e)}"
            )

    db_mold = crud.accept_mold(
        db,
        code=code,
        feedback=acceptance_feedback,
        technician=technician,
        image_url=image_url,
        attachment_url=attachment_url,
        attachment_name=attachment_name
    )
    if not db_mold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khuôn với mã: {code}"
        )
    return db_mold

@app.delete("/api/molds/{code}")
def delete_mold(code: str, db: Session = Depends(database.get_db)):
    """Xóa khuôn mẫu và toàn bộ nhật ký sự kiện, tệp đính kèm liên quan."""
    db_mold = crud.get_mold(db, code=code)
    if not db_mold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khuôn với mã: {code}"
        )
    
    # Xóa tệp vật lý của các file đính kèm liên quan
    for file in db_mold.files:
        file_path = os.path.join(PARENT_DIR, file.file_url.lstrip("/"))
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Lỗi khi xóa tệp vật lý: {e}")
                
    crud.delete_mold(db, db_mold)
    return {"detail": f"Đã xóa thành công khuôn {code} và toàn bộ nhật ký liên quan"}

@app.post("/api/molds/{code}/files")
def upload_mold_files(
    code: str,
    files: List[UploadFile] = File(...),
    is_attachment: bool = Form(False),
    db: Session = Depends(database.get_db)
):
    """Tải lên nhiều hình ảnh hoặc tài liệu đính kèm cho khuôn."""
    db_mold = crud.get_mold(db, code=code)
    if not db_mold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khuôn với mã: {code}"
        )
    
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved_files = []
    from datetime import datetime
    for file in files:
        # Tạo tên file độc nhất để không trùng lặp
        unique_filename = f"{code}_{int(datetime.now().timestamp())}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        db_file = models.MoldFile(
            mold_code=code,
            file_url=f"/uploads/{unique_filename}",
            file_name=file.filename,
            is_attachment=is_attachment
        )
        db.add(db_file)
        saved_files.append(db_file)
        
    db.commit()
    return {"detail": "Tải lên thành công", "files": [f.file_name for f in saved_files]}

@app.delete("/api/files/{file_id}")
def delete_mold_file(file_id: int, db: Session = Depends(database.get_db)):
    """Xóa một tệp đính kèm hoặc hình ảnh cụ thể khỏi khuôn."""
    db_file = db.query(models.MoldFile).filter(models.MoldFile.id == file_id).first()
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tệp tin"
        )
    
    # Xóa tệp vật lý
    file_path = os.path.join(PARENT_DIR, db_file.file_url.lstrip("/"))
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Lỗi khi xóa tệp vật lý: {e}")
            
    db.delete(db_file)
    db.commit()
    return {"detail": "Đã xóa tệp tin thành công"}

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
