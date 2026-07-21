"""
Zalo Sender Standalone Microservice
FastAPI service dedicated strictly to sending Zalo messages and managing Zalo authentication.
"""

import os
import time
import json
import logging
from typing import Optional, List
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, Form, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("zalo-sender")

# Configuration from Environment
GATEWAY_URL = os.getenv("ZALO_GATEWAY_URL", "http://127.0.0.1:8090").rstrip("/")
CONNECTION_KEY = os.getenv("ZALO_CONNECTION_KEY", "default")
PUBLIC_DOMAIN = os.getenv("PUBLIC_DOMAIN", "https://zl.n-lux.com").rstrip("/")
PORT = int(os.getenv("PORT", "8020"))
HOST = os.getenv("HOST", "0.0.0.0")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Zalo Sender Standalone Service on port {PORT}...")
    logger.info(f"Connected to Zalo Gateway at: {GATEWAY_URL}")
    yield
    logger.info("Shutting down Zalo Sender Service...")

app = FastAPI(
    title="Zalo Sender API Service",
    description="Standalone Microservice for sending Zalo text and image messages.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for external API consumers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class MessageSendRequest(BaseModel):
    thread_id: str = Field(..., description="Zalo User ID or Group ID")
    content: Optional[str] = Field("", description="Message text content")
    image_url: Optional[str] = Field(None, description="Optional single image URL")
    image_urls: Optional[List[str]] = Field(None, description="Optional list of image URLs")
    image_base64: Optional[str] = Field(None, description="Optional Base64 encoded image string")
    thread_type: Optional[str] = Field("user", description="Type of thread: 'user' or 'group'")

class BatchMessageRequest(BaseModel):
    thread_ids: List[str] = Field(..., description="List of Zalo User IDs or Group IDs")
    content: str = Field(..., description="Message text content")
    image_url: Optional[str] = Field(None, description="Optional image URL")
    thread_type: Optional[str] = Field("user", description="Type of thread: 'user' or 'group'")

# Helper function to call gateway
async def gateway_request(method: str, endpoint: str, data: Optional[dict] = None) -> dict:
    headers = {
        "X-Zalo-Connection-Key": CONNECTION_KEY,
        "Accept": "application/json"
    }
    url = f"{GATEWAY_URL}{endpoint}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            if method.upper() == "GET":
                resp = await client.get(url, headers=headers)
            else:
                resp = await client.post(url, json=data or {}, headers=headers)
            
            try:
                res_json = resp.json()
            except Exception:
                res_json = {"detail": resp.text}
                
            return {
                "status_code": resp.status_code,
                "ok": resp.is_success,
                "data": res_json
            }
        except Exception as e:
            logger.error(f"Gateway connection error: {e}")
            return {
                "status_code": 503,
                "ok": False,
                "data": {"detail": f"Gateway unreachable: {str(e)}"}
            }

# API Routes
@app.get("/", response_class=HTMLResponse)
async def home_dashboard():
    """Service landing page and navigation."""
    return f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>Zalo Sender API Service</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; background: #f8fafc; color: #1e293b; }}
            .card {{ background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 700px; margin: 0 auto; }}
            h1 {{ color: #0284c7; margin-top: 0; display: flex; align-items: center; gap: 10px; }}
            .btn {{ display: inline-block; background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 15px; }}
            .btn:hover {{ background: #0369a1; }}
            .code {{ background: #f1f5f9; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; word-break: break-all; }}
            .badge {{ display: inline-block; padding: 4px 8px; background: #dcfce7; color: #15803d; border-radius: 4px; font-size: 12px; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>💬 Zalo Sender Standalone API</h1>
            <p><span class="badge">ONLINE</span> Dịch vụ gửi tin nhắn Zalo độc lập qua HTTP REST API.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <h3>🔗 Chức Năng Chính & Endpoints:</h3>
            <ul>
                <li><b>Quét Mã QR Đăng Nhập:</b> <a href="/qr" class="btn" style="padding: 4px 10px; font-size: 12px;">Mở Trang QR Web</a></li>
                <li><b>Gửi Tin Nhắn (POST):</b> <code>/api/send</code></li>
                <li><b>Kiểm Tra Trạng Thái (GET):</b> <code>/api/status</code></li>
                <li><b>Danh Sách Trò Chuyện (GET):</b> <code>/api/threads</code></li>
                <li><b>API Documentation:</b> <a href="/docs" target="_blank">Swagger Docs UI</a></li>
            </ul>
            <h4>Cấu Hình Đang Dùng:</h4>
            <div class="code">
                GATEWAY: {GATEWAY_URL}<br>
                CONNECTION KEY: {CONNECTION_KEY}<br>
                SERVICE PORT: {PORT}
            </div>
        </div>
    </body>
    </html>
    """

@app.get("/api/status")
async def get_service_status():
    """Returns service health and Zalo login status (Strict Privacy Mode)."""
    res = await gateway_request("GET", "/health")
    if not res["ok"]:
        return {
            "status": "error",
            "connected": False,
            "message": "Không thể kết nối đến Zalo Gateway core",
            "detail": "Gateway offline"
        }
    
    gw_data = res["data"]
    is_logged_in = bool(gw_data.get("user_id")) and bool(gw_data.get("initialized"))
    raw_uid = str(gw_data.get("user_id", ""))
    
    # Mask UID for privacy protection (e.g. 223061******7765177)
    masked_uid = f"{raw_uid[:6]}******{raw_uid[-4:]}" if len(raw_uid) > 10 else "***"
    
    return {
        "status": "connected" if is_logged_in else "needs_qr_scan",
        "connected": is_logged_in,
        "privacy_mode": "STRICT_WRITE_ONLY",
        "user_id_masked": masked_uid if is_logged_in else None,
        "gateway_status": "active" if is_logged_in else "inactive",
        "qr_scan_url": f"{PUBLIC_DOMAIN}/qr" if not is_logged_in else None
    }

@app.get("/qr", response_class=HTMLResponse)
async def qr_login_page():
    """Web interface to display Zalo QR code for easy scanning via phone app."""
    return """
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>Quét Mã QR Zalo Login</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            .box { background: #1e293b; padding: 32px; border-radius: 16px; text-align: center; max-width: 420px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
            h2 { color: #38bdf8; margin-top: 0; }
            .qr-container { background: white; padding: 16px; border-radius: 12px; display: inline-block; margin: 20px 0; min-width: 240px; min-height: 240px; position: relative; }
            img { max-width: 240px; height: auto; border-radius: 8px; }
            .status { font-weight: 600; padding: 8px 16px; border-radius: 20px; display: inline-block; font-size: 14px; margin-top: 10px; }
            .status.pending { background: #0369a1; color: #e0f2fe; }
            .status.success { background: #15803d; color: #dcfce7; }
            .status.error { background: #b91c1c; color: #fef2f2; }
            .btn { background: #38bdf8; color: #0f172a; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; margin-top: 15px; }
            .btn:hover { background: #7dd3fc; }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>💬 Đăng Nhập Zalo Bằng Mã QR</h2>
            <p style="color: #94a3b8; font-size: 14px;">Mở ứng dụng Zalo trên điện thoại -> Chọn tab <b>Quét Mã QR</b> -> Quét mã bên dưới để đăng nhập dịch vụ gửi tin</p>
            
            <div class="qr-container" id="qr-box">
                <div style="color: #64748b; padding-top: 100px;">Đang tải mã QR...</div>
            </div>

            <div id="status-tag" class="status pending">Đang kết nối...</div>

            <div>
                <button class="btn" onclick="startQR()">🔄 Đổi Mã QR Mới</button>
            </div>
        </div>

        <script>
            let currentSessionId = null;
            let checkInterval = null;

            async function startQR() {
                clearInterval(checkInterval);
                const qrBox = document.getElementById('qr-box');
                const statusTag = document.getElementById('status-tag');
                qrBox.innerHTML = '<div style="color: #64748b; padding-top: 100px;">Đang tạo mã QR...</div>';
                statusTag.className = 'status pending';
                statusTag.innerText = 'Đang chờ quét...';

                try {
                    const res = await fetch('/api/qr/start');
                    const data = await res.json();
                    if (data.ok && data.image_data_url) {
                        currentSessionId = data.session_id;
                        qrBox.innerHTML = `<img src="${data.image_data_url}" alt="Zalo QR Code" />`;
                        
                        // Start polling scan status
                        checkInterval = setInterval(checkStatus, 2000);
                    } else {
                        qrBox.innerHTML = '<div style="color: #ef4444; padding-top: 100px;">Không tạo được mã QR</div>';
                        statusTag.className = 'status error';
                        statusTag.innerText = 'Lỗi tạo mã QR';
                    }
                } catch (e) {
                    qrBox.innerHTML = '<div style="color: #ef4444; padding-top: 100px;">Lỗi kết nối API</div>';
                }
            }

            async function checkStatus() {
                if (!currentSessionId) return;
                try {
                    const res = await fetch(`/api/qr/status/${currentSessionId}`);
                    const data = await res.json();
                    const statusTag = document.getElementById('status-tag');
                    
                    if (data.status === 'scanned') {
                        statusTag.innerText = 'Đã quét! Hãy xác nhận trên điện thoại...';
                    } else if (data.status === 'logged_in' || data.status === 'completed' || data.user_id) {
                        statusTag.className = 'status success';
                        statusTag.innerText = '✅ Đăng nhập thành công!';
                        clearInterval(checkInterval);
                        setTimeout(() => { window.location.href = '/'; }, 2000);
                    } else if (data.status === 'expired') {
                        statusTag.className = 'status error';
                        statusTag.innerText = 'Mã QR đã hết hạn. Vui lòng bấm đổi mã mới.';
                        clearInterval(checkInterval);
                    }
                } catch (e) {}
            }

            // Start automatically on page load
            startQR();
        </script>
    </body>
    </html>
    """

@app.get("/api/qr/start")
async def start_qr_login():
    """Generates a new Zalo QR code for scanning."""
    res = await gateway_request("POST", "/auth/qr/start")
    if not res["ok"]:
        raise HTTPException(status_code=500, detail=res["data"])
    return res["data"]

@app.get("/api/qr/status/{session_id}")
async def check_qr_status(session_id: str):
    """Polls the status of an ongoing QR login session."""
    res = await gateway_request("GET", f"/auth/qr/status/{session_id}")
    return res["data"]

import base64
import uuid
from fastapi import UploadFile, File, Form

@app.post("/api/send")
async def send_message(req: MessageSendRequest):
    """
    Main endpoint to send Zalo messages (supports text, single image_url, multiple image_urls, or image_base64).
    """
    payload = {
        "thread_id": req.thread_id.strip(),
        "thread_type": req.thread_type or "user",
        "content": (req.content or "").strip()
    }
    
    # 1. Single Image URL
    if req.image_url:
        payload["image_url"] = req.image_url.strip()
    
    # 2. Base64 Image
    elif req.image_base64:
        try:
            b64_str = req.image_base64
            if "base64," in b64_str:
                b64_str = b64_str.split("base64,", 1)[1]
            img_bytes = base64.b64decode(b64_str)
            tmp_filename = f"/tmp/zalo_b64_{uuid.uuid4().hex[:8]}.png"
            with open(tmp_filename, "wb") as f:
                f.write(img_bytes)
            payload["image_path"] = tmp_filename
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi giải mã Base64 image: {str(e)}")

    logger.info(f"Sending message/image to thread {req.thread_id} (type: {req.thread_type})...")
    res = await gateway_request("POST", "/messages/send", payload)

    if not res["ok"]:
        err_detail = res["data"].get("detail", "Failed to send message via gateway")
        logger.error(f"Failed to send to {req.thread_id}: {err_detail}")
        
        # Check if error is due to session expiration (#600 zpw_sek)
        if "zpw_sek" in str(err_detail).lower() or "#600" in str(err_detail):
            raise HTTPException(
                status_code=401,
                detail=f"Zalo session expired (zpw_sek missing). Please scan QR code at {PUBLIC_DOMAIN}/qr to log in again."
            )
        
        raise HTTPException(status_code=res["status_code"] or 500, detail=err_detail)

    # If multiple image_urls provided, send remaining images sequentially
    if req.image_urls and len(req.image_urls) > 0:
        for extra_url in req.image_urls:
            extra_payload = {
                "thread_id": req.thread_id.strip(),
                "thread_type": req.thread_type or "user",
                "image_url": extra_url.strip()
            }
            await gateway_request("POST", "/messages/send", extra_payload)

    return {
        "ok": True,
        "message": "Tin nhắn và hình ảnh Zalo đã được gửi thành công!",
        "thread_id": req.thread_id,
        "result": res["data"]
    }

@app.post("/api/send-image-file")
async def send_image_file(
    thread_id: str = Form(...),
    thread_type: str = Form("user"),
    content: Optional[str] = Form(""),
    file: UploadFile = File(...)
):
    """
    Direct File Upload endpoint: Send an image file uploaded directly from client/phone to Zalo thread.
    """
    try:
        ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
        tmp_path = f"/tmp/zalo_upload_{uuid.uuid4().hex[:8]}{ext}"
        content_bytes = await file.read()
        with open(tmp_path, "wb") as f:
            f.write(content_bytes)

        payload = {
            "thread_id": thread_id.strip(),
            "thread_type": thread_type or "user",
            "content": (content or "").strip(),
            "image_path": tmp_path
        }

        res = await gateway_request("POST", "/messages/send", payload)
        if not res["ok"]:
            err_detail = res["data"].get("detail", "Failed to send image file")
            raise HTTPException(status_code=res["status_code"] or 500, detail=err_detail)

        return {
            "ok": True,
            "message": f"Ảnh {file.filename} đã được gửi thành công!",
            "thread_id": thread_id,
            "result": res["data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tải và gửi tệp ảnh: {str(e)}")

@app.post("/api/send-batch")
async def send_batch_message(req: BatchMessageRequest, background_tasks: BackgroundTasks):
    """
    Sends a message to multiple Zalo recipients.
    """
    results = []
    for tid in req.thread_ids:
        try:
            payload = {
                "thread_id": tid.strip(),
                "thread_type": req.thread_type or "user",
                "content": req.content.strip()
            }
            if req.image_url:
                payload["image_url"] = req.image_url.strip()

            res = await gateway_request("POST", "/messages/send", payload)
            results.append({
                "thread_id": tid,
                "ok": res["ok"],
                "detail": res["data"]
            })
        except Exception as e:
            results.append({
                "thread_id": tid,
                "ok": False,
                "detail": str(e)
            })

    return {
        "total": len(req.thread_ids),
        "results": results
    }

@app.get("/api/threads")
async def get_recent_threads():
    """Blocked for privacy: Users cannot read friend list or thread history."""
    raise HTTPException(
        status_code=403,
        detail="Quyền truy cập bị từ chối: Dịch vụ bảo mật chỉ cho phép gửi tin nhắn (Write-Only), không hỗ trợ đọc danh sách bạn bè hay lịch sử cuộc trò chuyện."
    )

@app.get("/api/contacts")
async def get_contacts():
    """Blocked for privacy: Friend list reading is disabled."""
    raise HTTPException(
        status_code=403,
        detail="Quyền truy cập bị từ chối: Danh sách danh bạ cá nhân đã bị khóa vì lý do bảo mật."
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
