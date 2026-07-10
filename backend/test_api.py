import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Thêm path để import backend
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app
from backend.database import Base, get_db

# Thiết lập database riêng cho việc chạy test
TEST_DATABASE_URL = "sqlite:///./test_temp.db"

engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Ghi đè Dependency get_db của FastAPI để dùng DB Test
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    # Khởi tạo bảng
    Base.metadata.create_all(bind=engine)
    yield
    # Dọn dẹp sau khi chạy xong test
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists("test_temp.db"):
        os.remove("test_temp.db")

def test_db_status():
    response = client.get("/api/db-status")
    assert response.status_code == 200
    assert response.json()["status"] == "connected"

def test_create_mold():
    payload = {
        "code": "MK-TEST-01",
        "name": "Khuôn Thử Nghiệm API",
        "supplier": "Xưởng Cơ Khí Test",
        "import_date": "2026-07-10"
    }
    response = client.post("/api/molds", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == "MK-TEST-01"
    assert data["status"] == "Khuôn nhập kho"

def test_create_duplicate_mold_error():
    payload = {
        "code": "MK-TEST-01",
        "name": "Khuôn Trùng Lặp",
        "supplier": "Xưởng Cơ Khí Test",
        "import_date": "2026-07-10"
    }
    response = client.post("/api/molds", json=payload)
    assert response.status_code == 400
    assert "đã tồn tại" in response.json()["detail"]

def test_get_molds_list():
    response = client.get("/api/molds")
    assert response.status_code == 200
    molds = response.json()
    assert len(molds) >= 1
    assert any(m["code"] == "MK-TEST-01" for m in molds)

def test_get_mold_detail():
    response = client.get("/api/molds/MK-TEST-01")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == "MK-TEST-01"
    assert len(data["transaction_logs"]) == 1
    assert data["transaction_logs"][0]["status"] == "Khuôn nhập kho"

def test_update_mold_status():
    payload = {
        "status": "Thử khuôn",
        "notes": "Lắp ráp thử mẫu lần 1",
        "technician": "Kỹ sư Test"
    }
    response = client.post("/api/molds/MK-TEST-01/update", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Thử khuôn"

def test_report_mold_error():
    # Gọi dạng Form data (multipart/form-data)
    form_data = {
        "description": "Lỗi nứt góc sản phẩm dập thử",
        "cause": "Lực nén quá cao hoặc lõi khuôn quá mỏng",
        "solution": "Mài bớt góc hoặc giảm áp lực xi lanh",
        "status": "Nhà máy tự sửa",
        "technician": "Kỹ thuật viên Sửa Chữa"
    }
    response = client.post("/api/molds/MK-TEST-01/error", data=form_data)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Nhà máy tự sửa"
    
    # Kiểm tra xem error logs và transaction logs có được lưu đúng
    detail_resp = client.get("/api/molds/MK-TEST-01")
    detail = detail_resp.json()
    assert len(detail["error_logs"]) == 1
    assert detail["error_logs"][0]["description"] == "Lỗi nứt góc sản phẩm dập thử"
    assert any(log["status"] == "Nhà máy tự sửa" for log in detail["transaction_logs"])

def test_accept_mold():
    payload = {
        "acceptance_feedback": "Sản phẩm đẹp đạt chuẩn bóng 100%, phê duyệt chạy sản xuất đại trà",
        "technician": "Đại diện Khách hàng"
    }
    response = client.post("/api/molds/MK-TEST-01/accept", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Khách duyệt (Sản xuất)"
    assert data["acceptance_feedback"] is not None
    
    # Thống kê trên Dashboard
    db_stats_resp = client.get("/api/dashboard")
    stats = db_stats_resp.json()
    assert stats["total"] == 1
    assert stats["accepted"] == 1
