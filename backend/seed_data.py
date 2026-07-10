import os
import sys
import shutil
from datetime import date, datetime

# Thêm thư mục gốc vào path để import backend
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from backend import database, models

def seed():
    print("Bắt đầu khởi tạo dữ liệu mẫu...")
    db = database.SessionLocal()
    
    try:
        # 1. Dọn dẹp dữ liệu cũ để tránh trùng lặp
        db.query(models.ErrorLog).delete()
        db.query(models.TransactionLog).delete()
        db.query(models.Mold).delete()
        db.commit()
        print("Đã làm sạch dữ liệu cũ.")

        # 2. Định nghĩa danh sách khuôn mẫu và dữ liệu lịch sử tương ứng
        
        # --- MK-NAP-24 ---
        mold_nap = models.Mold(
            code="MK-NAP-24",
            name="Khuôn Nắp Chai Nhựa 24mm (24-Cavity)",
            supplier="Công ty Cơ khí Khuôn mẫu Minh Đức",
            import_date=date(2026, 6, 10),
            status="Khuôn nhập kho"
        )
        db.add(mold_nap)
        db.flush() # Để lấy quan hệ khóa ngoại
        
        db.add(models.TransactionLog(
            mold_code="MK-NAP-24",
            status="Khuôn nhập kho",
            notes="Nhập kho thành công khuôn nắp chai nhựa 24mm từ NCC Minh Đức",
            technician="Hệ thống",
            created_at=datetime(2026, 6, 10, 8, 30)
        ))

        # --- MK-THU-08 ---
        mold_thu = models.Mold(
            code="MK-THU-08",
            name="Khuôn Thân Hộp Mỹ Phẩm 50g (8-Cavity)",
            supplier="Supplier HighTech Mold",
            import_date=date(2026, 6, 12),
            status="Thử khuôn"
        )
        db.add(mold_thu)
        db.flush()
        
        db.add(models.TransactionLog(
            mold_code="MK-THU-08",
            status="Khuôn nhập kho",
            notes="Nhập kho thành công khuôn thân hộp mỹ phẩm từ NCC HighTech",
            technician="Hệ thống",
            created_at=datetime(2026, 6, 12, 9, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-THU-08",
            status="Thử khuôn",
            notes="Lắp ráp lên máy số 3 dập thử mẫu lần 1",
            technician="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 13, 14, 15)
        ))

        # --- MK-QUAI-12 ---
        mold_quai = models.Mold(
            code="MK-QUAI-12",
            name="Khuôn Quai Thùng Sơn 18L (Hot Runner)",
            supplier="Nhà sản xuất Khuôn nhựa Á Đông",
            import_date=date(2026, 6, 5),
            status="Nhà máy tự sửa"
        )
        db.add(mold_quai)
        db.flush()

        db.add(models.TransactionLog(
            mold_code="MK-QUAI-12",
            status="Khuôn nhập kho",
            notes="Nhập kho thành công khuôn quai thùng sơn 18l từ NCC Á Đông",
            technician="Hệ thống",
            created_at=datetime(2026, 6, 5, 10, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-QUAI-12",
            status="Thử khuôn Không đạt",
            notes="Thử khuôn hỏng: Sản phẩm bị ba bớ nặng dính ở cuống phun, áp lực phun không cân bằng.",
            technician="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 17, 17, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-QUAI-12",
            status="Nhà máy tự sửa",
            notes="Báo lỗi chạy thử hỏng: Ba bớ dính ở cuống phun, áp lực phun không đều ở các cavity biên",
            technician="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 18, 9, 30)
        ))
        
        # Tạo tệp ảnh lỗi mô phỏng
        upload_dir = os.path.join(PARENT_DIR, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        # Sao chép ảnh tracuu.jpg thành ảnh lỗi của quai_12
        ref_image_path = os.path.join(PARENT_DIR, "ref", "tracuu.jpg")
        err_image_name = "error_quai_12.jpg"
        if os.path.exists(ref_image_path):
            shutil.copy2(ref_image_path, os.path.join(upload_dir, err_image_name))
            
        db.add(models.ErrorLog(
            mold_code="MK-QUAI-12",
            description="Ba bớ dính ở cuống phun, áp lực phun không đều ở các cavity biên",
            cause="Kích thước cổng phun (gate) nhỏ hơn thiết kế 0.15mm",
            solution="Nhà máy tự sửa",
            image_url=f"/uploads/{err_image_name}",
            created_at=datetime(2026, 6, 18, 9, 30)
        ))

        # --- MK-CHAI-PET ---
        mold_chai = models.Mold(
            code="MK-CHAI-PET",
            name="Khuôn Chai PET 500ml Cổ 30mm (16-Cavity)",
            supplier="Cơ khí Chính xác Minh Tâm",
            import_date=date(2026, 6, 1),
            status="NCC đã lấy khuôn"
        )
        db.add(mold_chai)
        db.flush()

        db.add(models.TransactionLog(
            mold_code="MK-CHAI-PET",
            status="Khuôn nhập kho",
            notes="Nhập kho thành công khuôn chai PET từ NCC Minh Tâm",
            technician="Hệ thống",
            created_at=datetime(2026, 6, 1, 11, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-CHAI-PET",
            status="Thử khuôn Không đạt",
            notes="Thử khuôn hỏng: Rò rỉ nước làm mát hệ thống slide lõi",
            technician="Trần Văn Hùng (Kỹ thuật vận hành)",
            created_at=datetime(2026, 6, 12, 16, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-CHAI-PET",
            status="NCC đã lấy khuôn",
            notes="Bàn giao lại khuôn cho NCC mang về bảo hành sửa slide nước",
            technician="Lê Minh Hoàng (Quản đốc xưởng)",
            created_at=datetime(2026, 6, 14, 10, 30)
        ))
        
        db.add(models.ErrorLog(
            mold_code="MK-CHAI-PET",
            description="Rò rỉ nước làm mát hệ thống slide lõi gây bọt khí sản phẩm",
            cause="Hỏng gioăng cao su chịu nhiệt ở slide bên trái",
            solution="NCC đã lấy khuôn về bảo hành sửa đổi",
            image_url=None,
            created_at=datetime(2026, 6, 14, 10, 30)
        ))

        # --- MK-DE-GIAC ---
        mold_de = models.Mold(
            code="MK-DE-GIAC",
            name="Khuôn Đế Giác Cắm Điện Thông Minh",
            supplier="Nhà cung cấp Khuôn mẫu Việt Nhật",
            import_date=date(2026, 6, 15),
            status="Gửi mẫu khách"
        )
        db.add(mold_de)
        db.flush()

        db.add(models.TransactionLog(
            mold_code="MK-DE-GIAC",
            status="Khuôn nhập kho",
            notes="Nhập kho thành công khuôn đế giác cắm điện từ NCC Việt Nhật",
            technician="Hệ thống",
            created_at=datetime(2026, 6, 15, 8, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-DE-GIAC",
            status="Thử khuôn",
            notes="Dập thử nghiệm đạt kích thước hình học chuẩn",
            technician="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 15, 15, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-DE-GIAC",
            status="Gửi mẫu khách",
            notes="Gửi mẫu thử lần 1 cho phòng R&D của khách hàng duyệt",
            technician="Lê Minh Hoàng (Quản đốc xưởng)",
            created_at=datetime(2026, 6, 16, 11, 0)
        ))

        # --- MK-HOP-NUT ---
        mold_hop = models.Mold(
            code="MK-HOP-NUT",
            name="Khuôn Nắp Hộp Thực Phẩm 1.2L (4-Cavity)",
            supplier="Công ty Cơ khí Khuôn mẫu Minh Đức",
            import_date=date(2026, 5, 20),
            status="Khách duyệt (Sản xuất)",
            acceptance_date=date(2026, 6, 10),
            acceptance_feedback="Sản phẩm đạt yêu cầu về độ bóng bề mặt và độ khít nắp hộp. Chấp thuận chạy sản xuất đại trà."
        )
        db.add(mold_hop)
        db.flush()

        db.add(models.TransactionLog(
            mold_code="MK-HOP-NUT",
            status="Khuôn nhập kho",
            notes="Nhập kho thành công khuôn nắp hộp 1.2l từ NCC Minh Đức",
            technician="Hệ thống",
            created_at=datetime(2026, 5, 20, 14, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-HOP-NUT",
            status="Thử khuôn",
            notes="Thử khuôn thành công: sản phẩm đạt tính thẩm mỹ",
            technician="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 5, 24, 10, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-HOP-NUT",
            status="Gửi mẫu khách",
            notes="Gửi mẫu thử đạt cho khách hàng đánh giá lắp ghép thực phẩm",
            technician="Lê Minh Hoàng (Quản đốc xưởng)",
            created_at=datetime(2026, 5, 25, 9, 0)
        ))
        db.add(models.TransactionLog(
            mold_code="MK-HOP-NUT",
            status="Khách duyệt (Sản xuất)",
            notes="Khách duyệt nghiệm thu: Sản phẩm đạt yêu cầu về độ bóng bề mặt và độ khít nắp hộp. Chấp thuận chạy sản xuất đại trà.",
            technician="Đại diện khách hàng",
            created_at=datetime(2026, 6, 10, 16, 30)
        ))

        # Commit toàn bộ dữ liệu mẫu
        db.commit()
        print("Đã hoàn tất nạp dữ liệu mẫu thành công!")

    except Exception as e:
        db.rollback()
        print("Có lỗi xảy ra khi nạp dữ liệu mẫu:", str(e))
    finally:
        db.close()

if __name__ == "__main__":
    seed()
