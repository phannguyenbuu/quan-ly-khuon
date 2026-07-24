import os
import sys
import shutil
import random
from datetime import date, datetime

# Thêm thư mục gốc vào path để import backend
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from backend import database, models

def seed():
    print("Bắt đầu khởi tạo dữ liệu mẫu nâng cao (Theo mô hình MoldEvent)...")
    models.Base.metadata.create_all(bind=database.engine)
    db = database.SessionLocal()
    
    try:
        # 1. Dọn dẹp dữ liệu cũ
        db.query(models.MoldEvent).delete()
        db.query(models.Mold).delete()
        db.query(models.Staff).delete()
        db.query(models.Status).delete()
        db.commit()
        print("Đã làm sạch dữ liệu cũ.")

        # Khởi tạo thư mục uploads
        upload_dir = os.path.join(PARENT_DIR, "uploads")
        os.makedirs(upload_dir, exist_ok=True)

        # Quét các file hình ảnh từ D:\Dropbox\Textures
        texture_images = []
        textures_path = "D:\\Dropbox\\Textures"
        if os.path.exists(textures_path):
            for root, dirs, files in os.walk(textures_path):
                for file in files:
                    if file.lower().endswith(('.jpg', '.png', '.jpeg')) and not file.startswith('._'):
                        texture_images.append(os.path.join(root, file))
        
        print(f"Tìm thấy {len(texture_images)} hình ảnh mẫu trong thư mục textures.")

        # Hàm lấy danh sách hình ảnh mẫu ngẫu nhiên cho mỗi khuôn
        def get_sample_images(code, count=4):
            copied_files = []
            if len(texture_images) >= count:
                selected = random.sample(texture_images, count)
                for idx, src in enumerate(selected):
                    ext = os.path.splitext(src)[1]
                    filename = f"{code}_gallery_{idx + 1}{ext}"
                    dest = os.path.join(upload_dir, filename)
                    try:
                        shutil.copy2(src, dest)
                        copied_files.append(f"/uploads/{filename}")
                    except Exception as e:
                        print(f"Lỗi khi copy ảnh {src}: {e}")
            else:
                tracuu_path = os.path.join(PARENT_DIR, "ref", "tracuu.jpg")
                if os.path.exists(tracuu_path):
                    for idx in range(count):
                        filename = f"{code}_gallery_fallback_{idx + 1}.jpg"
                        shutil.copy2(tracuu_path, os.path.join(upload_dir, filename))
                        copied_files.append(f"/uploads/{filename}")
            return copied_files

        # 2. Tạo nhân sự & trạng thái cấu hình
        staff_list = [
            models.Staff(name="Kỹ thuật viên Sửa Chữa", role="Thợ khuôn"),
            models.Staff(name="Kỹ sư Đảm bảo Chất lượng (QC)", role="QC"),
            models.Staff(name="Quản lý Xưởng sản xuất", role="Quản lý")
        ]
        db.add_all(staff_list)
        
        status_list = [
            models.Status(name="Khuôn nhập kho", description="Khai báo khuôn mới về xưởng sản xuất", color="import"),
            models.Status(name="Thử khuôn", description="Lắp khuôn lên máy chạy thử sản phẩm mẫu", color="trial"),
            models.Status(name="Gửi mẫu khách", description="Dập mẫu đạt và gửi mẫu đi cho khách duyệt", color="sample"),
            models.Status(name="Nhà máy tự sửa", description="Phát hiện lỗi chạy thử, thợ xưởng tự khắc phục", color="selfrepair"),
            models.Status(name="NCC đã lấy khuôn", description="Bàn giao lại cho NCC đem về bảo hành/sửa đổi", color="supplier"),
            models.Status(name="Khách duyệt (Sản xuất)", description="Khách ký duyệt chất lượng mẫu, đưa vào chạy hàng loạt", color="accepted")
        ]
        db.add_all(status_list)
        db.flush()

        # 3. Định nghĩa các khuôn mẫu và nạp dữ liệu sự kiện liên quan

        # --- MK-NAP-24 ---
        mold_nap = models.Mold(
            code="MK-NAP-24",
            name="Khuôn Nắp Chai Nhựa 24mm (24-Cavity)",
            supplier="Công ty Cơ khí Khuôn mẫu Minh Đức",
            import_date=date(2026, 6, 10),
            status="Khuôn nhập kho"
        )
        db.add(mold_nap)
        db.flush()
        
        # Sự kiện nhập kho
        db.add(models.MoldEvent(
            mold_code="MK-NAP-24",
            type="transaction",
            name="Khuôn nhập kho",
            content="Nhập kho thành công khuôn <strong>nắp chai nhựa 24mm</strong> từ NCC <em>Minh Đức</em>",
            tagged_staff="Hệ thống",
            created_at=datetime(2026, 6, 10, 8, 30),
            images=",".join(get_sample_images("MK-NAP-24", count=3))
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
        
        db.add(models.MoldEvent(
            mold_code="MK-THU-08",
            type="transaction",
            name="Khuôn nhập kho",
            content="Nhập kho thành công khuôn <strong>thân hộp mỹ phẩm 50g</strong> từ NCC <em>HighTech</em>",
            tagged_staff="Hệ thống",
            created_at=datetime(2026, 6, 12, 9, 0)
        ))
        
        db.add(models.MoldEvent(
            mold_code="MK-THU-08",
            type="transaction",
            name="Thử khuôn",
            content="Lắp ráp lên máy số 3 dập thử mẫu lần 1",
            tagged_staff="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 13, 14, 15),
            images=",".join(get_sample_images("MK-THU-08", count=2))
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
        
        db.add(models.MoldEvent(
            mold_code="MK-QUAI-12",
            type="transaction",
            name="Khuôn nhập kho",
            content="Nhập kho thành công khuôn <strong>quai thùng sơn 18L</strong> từ NCC <em>Á Đông</em>",
            tagged_staff="Hệ thống",
            created_at=datetime(2026, 6, 5, 10, 0)
        ))
        
        db.add(models.MoldEvent(
            mold_code="MK-QUAI-12",
            type="transaction",
            name="Thử khuôn",
            content="Thử khuôn hỏng: Sản phẩm bị ba bớ nặng dính ở cuống phun, áp lực phun không cân bằng.",
            tagged_staff="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 17, 17, 0)
        ))
        
        tracuu_path = os.path.join(PARENT_DIR, "ref", "tracuu.jpg")
        err_image_name = "error_quai_12.jpg"
        if os.path.exists(tracuu_path):
            shutil.copy2(tracuu_path, os.path.join(upload_dir, err_image_name))
            
        db.add(models.MoldEvent(
            mold_code="MK-QUAI-12",
            type="issue",
            name="Báo lỗi: Nhà máy tự sửa",
            content="<strong>Mô tả sự cố:</strong> Ba bớ dính ở cuống phun, áp lực phun không đều ở các cavity biên<br/><strong>Nguyên nhân:</strong> Kích thước cổng phun (gate) nhỏ hơn thiết kế 0.15mm<br/><strong>Giải pháp:</strong> Nhà máy tự sửa",
            tagged_staff="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            images=f"/uploads/{err_image_name}",
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
        
        db.add(models.MoldEvent(
            mold_code="MK-CHAI-PET",
            type="transaction",
            name="Khuôn nhập kho",
            content="Nhập kho thành công khuôn <strong>chai PET 500ml</strong> từ NCC <em>Minh Tâm</em>",
            tagged_staff="Hệ thống",
            created_at=datetime(2026, 6, 1, 11, 0)
        ))
        
        db.add(models.MoldEvent(
            mold_code="MK-CHAI-PET",
            type="issue",
            name="Báo lỗi: NCC đã lấy khuôn",
            content="<strong>Mô tả sự cố:</strong> Rò rỉ nước làm mát hệ thống slide lõi gây bọt khí sản phẩm<br/><strong>Nguyên nhân:</strong> Hỏng gioăng cao su chịu nhiệt ở slide bên trái<br/><strong>Giải pháp:</strong> NCC đã lấy khuôn về bảo hành sửa đổi",
            tagged_staff="Trần Văn Hùng (Kỹ thuật vận hành)",
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
        
        db.add(models.MoldEvent(
            mold_code="MK-DE-GIAC",
            type="transaction",
            name="Khuôn nhập kho",
            content="Nhập kho thành công khuôn <strong>đế giác cắm điện thông minh</strong> từ NCC <em>Việt Nhật</em>",
            tagged_staff="Hệ thống",
            created_at=datetime(2026, 6, 15, 8, 0)
        ))
        db.add(models.MoldEvent(
            mold_code="MK-DE-GIAC",
            type="transaction",
            name="Thử khuôn",
            content="Dập thử nghiệm đạt kích thước hình học chuẩn",
            tagged_staff="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 6, 15, 15, 0)
        ))
        db.add(models.MoldEvent(
            mold_code="MK-DE-GIAC",
            type="transaction",
            name="Gửi mẫu khách",
            content="Gửi mẫu thử lần 1 cho phòng R&D của khách hàng duyệt",
            tagged_staff="Lê Minh Hoàng (Quản đốc xưởng)",
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
        
        db.add(models.MoldEvent(
            mold_code="MK-HOP-NUT",
            type="transaction",
            name="Khuôn nhập kho",
            content="Nhập kho thành công khuôn <strong>nắp hộp thực phẩm 1.2L</strong> từ NCC <em>Minh Đức</em>",
            tagged_staff="Hệ thống",
            created_at=datetime(2026, 5, 20, 14, 0)
        ))
        db.add(models.MoldEvent(
            mold_code="MK-HOP-NUT",
            type="transaction",
            name="Thử khuôn",
            content="Thử khuôn thành công: sản phẩm đạt tính thẩm mỹ",
            tagged_staff="Nguyễn Hoàng Nam (Kỹ thuật sản xuất)",
            created_at=datetime(2026, 5, 24, 10, 0)
        ))
        db.add(models.MoldEvent(
            mold_code="MK-HOP-NUT",
            type="transaction",
            name="Gửi mẫu khách",
            content="Gửi mẫu thử đạt cho khách hàng đánh giá lắp ghép thực phẩm",
            tagged_staff="Lê Minh Hoàng (Quản đốc xưởng)",
            created_at=datetime(2026, 5, 25, 9, 0)
        ))
        
        import json
        doc_name = "Bao_cao_nghiem_thu_lap_ghep.pdf"
        doc_path = os.path.join(upload_dir, doc_name)
        with open(doc_path, "w", encoding="utf-8") as f:
            f.write("Đây là tệp nghiệm thu mẫu.")
            
        db.add(models.MoldEvent(
            mold_code="MK-HOP-NUT",
            type="acceptance",
            name="Khách duyệt (Sản xuất)",
            content="Khách duyệt nghiệm thu: <span class='text-success'>Sản phẩm đạt yêu cầu về độ bóng bề mặt và độ khít nắp hộp. Chấp thuận chạy sản xuất đại trà.</span>",
            tagged_staff="Đại diện khách hàng",
            attachments=json.dumps([{"name": doc_name, "url": f"/uploads/{doc_name}"}]),
            created_at=datetime(2026, 6, 10, 16, 30)
        ))

        # Commit toàn bộ
        db.commit()
        print("Đã hoàn tất nạp dữ liệu mẫu mới thành công!")
 
    except Exception as e:
        db.rollback()
        print("Có lỗi xảy ra khi nạp dữ liệu mẫu:", str(e))
    finally:
        db.close()

if __name__ == "__main__":
    seed()
