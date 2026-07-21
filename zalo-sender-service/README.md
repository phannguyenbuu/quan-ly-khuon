# 💬 Standalone Zalo Sender API Service (https://zl.n-lux.com)

Microservice độc lập chuyên phục vụ gửi tin nhắn Zalo (Văn bản + Hình ảnh + File đính kèm) qua HTTP/HTTPS REST API.

---

## 🚀 Domain & SSL Trực Tuyến
* **Domain chính thức (HTTPS):** `https://zl.n-lux.com`
* **Cổng dịch vụ nội bộ:** `8020`
* **Swagger API Docs (Trực quan):** `https://zl.n-lux.com/docs`
* **Giao diện Web Quét Mã QR Login:** `https://zl.n-lux.com/qr`

---

## 📡 Chi Tiết REST API Endpoints

### 1. Gửi tin nhắn Zalo (`POST https://zl.n-lux.com/api/send`)
**Header:** `Content-Type: application/json`  
**Body mẫu (JSON):**
```json
{
  "thread_id": "2230614315317765177",
  "content": "Thông báo từ Zalo Standalone API Service: Kiểm tra tiến độ xưởng khuôn",
  "image_url": "http://31.97.76.62:8001/uploads/sample.jpg",
  "thread_type": "user"
}
```

### 2. Gửi hàng loạt (`POST https://zl.n-lux.com/api/send-batch`)
**Body mẫu (JSON):**
```json
{
  "thread_ids": ["2230614315317765177", "3740402378099889445"],
  "content": "Cập nhật tiến độ nhà xưởng ngày hôm nay",
  "thread_type": "user"
}
```

### 3. Kiểm tra trạng thái kết nối (`GET https://zl.n-lux.com/api/status`)
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

### 4. Quét mã QR đăng nhập (`GET https://zl.n-lux.com/qr`)
Mở trình duyệt truy cập: `https://zl.n-lux.com/qr`

---

## ⚙️ Cài Đặt & Chạy Trên VPS (PM2)
```bash
# Quản lý bằng PM2
pm2 restart zalo-sender-service
```
