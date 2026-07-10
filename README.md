# Hệ thống Quản lý Khuôn v1.1 (MouldingManagement - React + TypeScript)

Dự án phần mềm quản lý quy trình chạy thử, báo lỗi kỹ thuật và nghiệm thu khuôn mẫu sản xuất. 

Dự án đã được tách rời cấu trúc (Client-Server):
* **Backend:** Python 3 (FastAPI) + SQLAlchemy + PostgreSQL (SQLite dự phòng khi chạy local).
* **Frontend:** React + TypeScript (Vite), giao diện tuân thủ 100% hình ảnh mockup trong `/ref`.

---

## 1. Cấu Trúc Dự Án
* `/backend`: Chứa mã nguồn Python FastAPI cung cấp RESTful API.
* `/frontend`: Chứa mã nguồn React + TypeScript quản lý giao diện SPA và biểu đồ.

---

## 2. Hướng Dẫn Chạy Cục Bộ (Local Development)

Để phát triển hoặc chạy thử cục bộ, bạn cần chạy song song cả Backend và Frontend:

### Phần A: Khởi động Backend (FastAPI)
1. Cài đặt thư viện:
   ```bash
   pip install -r requirements.txt
   ```
2. Chạy server (Cổng mặc định `8000`):
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

### Phần B: Khởi động Frontend (React dev server)
1. Truy cập thư mục `/frontend`:
   ```bash
   cd frontend
   ```
2. Cài đặt các gói npm:
   ```bash
   npm install
   ```
3. Chạy dev server (Cổng mặc định `5173`):
   ```bash
   npm run dev
   ```
Mở trình duyệt web truy cập: **`http://localhost:5173`**. Khi chạy ở chế độ dev, các yêu cầu API sẽ được tự động chuyển tiếp tới `http://localhost:8000` thông qua cấu hình API_BASE.

---

## 3. Kiểm Thử API (Automated Tests)
Chạy bộ test tự động sử dụng `pytest`:
```bash
pytest backend/test_api.py -v
```

---

## 4. Hướng Dẫn Triển Khai Lên VPS (Production Deployment)

### Bước 1: Build Frontend đóng gói tĩnh
Trên máy cá nhân, truy cập thư mục `/frontend` và chạy:
```bash
npm run build
```
Vite sẽ biên dịch toàn bộ React + TS sang dạng file tĩnh trong thư mục `/frontend/dist`.

### Bước 2: Tải code lên VPS
Tải toàn bộ thư mục dự án lên VPS (ví dụ đặt tại `/opt/quan-ly-khuon`). Đảm bảo thư mục `/frontend/dist` đã có trên VPS.
*(Lưu ý: Tệp `backend/main.py` của FastAPI đã được cấu hình tự động phục vụ thư mục `/frontend/dist` như các file tĩnh nếu tồn tại, giúp bạn không cần cấu hình Nginx phức tạp để phục vụ frontend)*.

### Bước 3: Cấu hình và chạy dịch vụ bằng PM2 trên VPS
1. Tạo môi trường ảo và cài đặt dependencies trên VPS:
   ```bash
   python3 -m venv /opt/quan-ly-khuon/venv
   /opt/quan-ly-khuon/venv/bin/pip install -r /opt/quan-ly-khuon/requirements.txt
   ```
2. Cập nhật file `.env` trên VPS để kết nối tới PostgreSQL của VPS.
3. Đăng ký chạy dịch vụ qua PM2:
   ```bash
   cd /opt/quan-ly-khuon
   pm2 start "/opt/quan-ly-khuon/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8001" --name moulding-api
   pm2 save
   ```

Ứng dụng của bạn sẽ chạy ổn định tại địa chỉ **`http://<IP_VPS>:8001`**. Giao diện React sẽ tự động gọi API cùng nguồn và lưu dữ liệu vào PostgreSQL trên VPS.
