# 💬 Standalone Zalo Sender API Service

Microservice độc lập chuyên phục vụ gửi tin nhắn Zalo (Văn bản + Hình ảnh + File đính kèm) qua HTTP REST API.

---

## 🚀 Tính Năng Chính
1. **API gửi tin nhắn đơn & hàng loạt:** `POST /api/send`, `POST /api/send-batch`
2. **Giao diện Web Quét mã QR Login:** Bấm mở `http://<VPS_IP>:8020/qr` để quét QR bằng Zalo Mobile app bất cứ lúc nào.
3. **Tự động theo dõi trạng thái phiên:** `GET /api/status` báo ngay nếu tài khoản chưa đăng nhập hoặc hết hạn `zpw_sek`.
4. **Kiểm tra danh sách cuộc trò chuyện:** `GET /api/threads`

---

## 📡 Chi Tiết REST API Endpoints

### 1. Gửi tin nhắn Zalo (`POST /api/send`)
**Header:** `Content-Type: application/json`  
**Body:**
```json
{
  "thread_id": "2230614315317765177",
  "content": "Thông báo: Khuôn MK-NAP-24 đã hoàn thành sửa chữa!",
  "image_url": "http://31.97.76.62:8001/uploads/sample.jpg",
  "thread_type": "user"
}
```

### 2. Gửi hàng loạt (`POST /api/send-batch`)
**Body:**
```json
{
  "thread_ids": ["2230614315317765177", "3740402378099889445"],
  "content": "Cập nhật tiến độ nhà xưởng ngày hôm nay",
  "thread_type": "user"
}
```

### 3. Kiểm tra trạng thái (`GET /api/status`)
**Response:**
```json
{
  "status": "connected",
  "connected": true,
  "user_id": "2230614315317765177",
  "account_name": "Phan Nguyên Bửu",
  "connection_key": "default"
}
```

### 4. Quét mã QR đăng nhập (`GET /qr`)
Mở trình duyệt truy cập: `http://31.97.76.62:8020/qr`

---

## ⚙️ Cài Đặt & Chạy Trên VPS (PM2)
```bash
# 1. Chép thư mục dịch vụ vào VPS
mkdir -p /opt/zalo-sender-service
cd /opt/zalo-sender-service

# 2. Tạo virtualenv và cài dependencies
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

# 3. Quản lý bằng PM2
pm2 start "venv/bin/uvicorn main:app --host 0.0.0.0 --port 8020" --name "zalo-sender-service"
pm2 save
```
