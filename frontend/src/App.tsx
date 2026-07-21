import React, { useState, useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

// Định nghĩa base URL linh hoạt: khi dev local trỏ về port 8000, khi production dùng cùng origin
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin);

// --- Interfaces & Types ---
interface TransactionLog {
  id: number;
  mold_code: string;
  status: string;
  notes?: string;
  technician: string;
  created_at: string;
}

interface ZaloNotification {
  id: number;
  recipient: string;
  message: string;
  image_url?: string;
  status: string;
  created_at: string;
}

interface ErrorLog {
  id: number;
  mold_code: string;
  description: string;
  cause?: string;
  solution?: string;
  image_url?: string;
  repair_deadline?: string;
  supplier_pickup_status?: string;
  created_at: string;
}

interface MoldFile {
  id: number;
  mold_code: string;
  file_url: string;
  file_name: string;
  is_attachment: boolean;
  created_at: string;
}

interface Mold {
  code: string;
  name: string;
  supplier: string;
  import_date: string;
  status: string;
  acceptance_date?: string;
  acceptance_feedback?: string;
  acceptance_image_url?: string;
  acceptance_attachment_url?: string;
  acceptance_attachment_name?: string;
}

interface MoldDetail extends Mold {
  transaction_logs: TransactionLog[];
  error_logs: ErrorLog[];
  files: MoldFile[];
}

interface DashboardStats {
  total: number;
  testing: number;
  error: number;
  accepted: number;
  status_distribution: Record<string, number>;
  supplier_distribution: Record<string, number>;
}

interface DbStatus {
  status: string;
  database: string;
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'lookup' | 'config'>('dashboard');

  // Modal Control States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'new' | 'update'>('new');
  
  // Fullscreen Lightbox Image url
  const [lightboxImgUrl, setLightboxImgUrl] = useState<string | null>(null);

  // Core Data States
  const [molds, setMolds] = useState<Mold[]>([]);
  const [selectedMoldCode, setSelectedMoldCode] = useState<string | null>(null);
  const [selectedMoldDetail, setSelectedMoldDetail] = useState<MoldDetail | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    testing: 0,
    error: 0,
    accepted: 0,
    status_distribution: {},
    supplier_distribution: {}
  });
  const [dbStatus, setDbStatus] = useState<DbStatus>({
    status: 'checking',
    database: 'Checking status...'
  });
  const [zaloNotifs, setZaloNotifs] = useState<ZaloNotification[]>([]);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('Tất cả trạng thái');

  // Form States (New Mold)
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newImportDate, setNewImportDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Form States (Update Mold)
  const [updateMoldCode, setUpdateMoldCode] = useState('');
  const [updateTechnician, setUpdateTechnician] = useState('Kỹ thuật viên');
  const [updateStatus, setUpdateStatus] = useState('');
  const [errorDesc, setErrorDesc] = useState('');
  const [errorCause, setErrorCause] = useState('');
  const [errorSolution, setErrorSolution] = useState('');
  const [errorImageFile, setErrorImageFile] = useState<File | null>(null);
  const [repairDeadline, setRepairDeadline] = useState('');
  const [supplierPickupStatus, setSupplierPickupStatus] = useState('Nhà cung cấp hẹn lấy');
  
  const [acceptFeedback, setAcceptFeedback] = useState('');
  const [acceptImageFile, setAcceptImageFile] = useState<File | null>(null);
  const [acceptAttachmentFile, setAcceptAttachmentFile] = useState<File | null>(null);
  const [generalNotes, setGeneralNotes] = useState('');

  // MULTIPLE FILES & IMAGES UPLOAD (In Modal)
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);

  // Chart References
  const statusChartRef = useRef<HTMLCanvasElement | null>(null);
  const supplierChartRef = useRef<HTMLCanvasElement | null>(null);
  const statusChartInstance = useRef<Chart | null>(null);
  const supplierChartInstance = useRef<Chart | null>(null);
  const hiddenGalleryInputRef = useRef<HTMLInputElement | null>(null);

  // --- Date Formatter Helper ---
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  // --- Clipboard Paste (Ctrl+V) listener ---
  useEffect(() => {
    if (!isModalOpen) return;
    
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            setSelectedImages(prev => [...prev, file]);
            alert("Đã nhận hình ảnh từ bộ nhớ tạm (Ctrl+V)!");
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isModalOpen]);

  // --- API Functions ---
  const fetchDbStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/db-status`);
      const data = await res.json();
      setDbStatus({
        status: data.status,
        database: data.database || 'SQLite/Local'
      });
    } catch {
      setDbStatus({ status: 'disconnected', database: 'Lỗi kết nối API Server' });
    }
  };

  const fetchZaloNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/zalo-notifications`);
      if (res.ok) {
        const data = await res.json();
        setZaloNotifs(data);
      }
    } catch (e) {
      console.error("Lỗi khi tải thông báo Zalo:", e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dashboard`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Lỗi khi tải thống kê:", e);
    }
  };

  const fetchMolds = async (search = '', status = 'Tất cả trạng thái') => {
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (status && status !== 'Tất cả trạng thái') params.append("status", status);
      
      const res = await fetch(`${API_BASE}/api/molds?${params.toString()}`);
      const data = await res.json();
      setMolds(data);
    } catch (e) {
      console.error("Lỗi khi tải danh sách khuôn:", e);
    }
  };

  const fetchMoldDetails = async (code: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/molds/${code}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedMoldDetail(data);
      }
    } catch (e) {
      console.error("Lỗi khi tải chi tiết khuôn:", e);
    }
  };

  // --- Initial Mount & Listeners ---
  useEffect(() => {
    fetchDbStatus();
    fetchStats();
    fetchMolds();
    fetchZaloNotifications();
  }, []);

  // Reload data based on active tab
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchStats();
    } else if (activeTab === 'lookup') {
      fetchMolds(searchQuery, filterStatus);
    } else if (activeTab === 'config') {
      fetchZaloNotifications();
    }
  }, [activeTab]);

  // Debounced Search & Filter
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (activeTab === 'lookup') {
        fetchMolds(searchQuery, filterStatus);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, filterStatus]);

  // Load selected mold details
  useEffect(() => {
    if (selectedMoldCode) {
      fetchMoldDetails(selectedMoldCode);
    }
  }, [selectedMoldCode]);

  // --- Chart Drawing Logic ---
  useEffect(() => {
    if (activeTab !== 'dashboard') return;

    // 1. Vẽ Donut Chart (Trạng thái)
    if (statusChartRef.current) {
      if (statusChartInstance.current) statusChartInstance.current.destroy();

      const defaultLabels = ["Khuôn nhập kho", "Thử khuôn", "Gửi mẫu khách", "Nhà máy tự sửa", "NCC đã lấy khuôn", "Khách duyệt (Sản xuất)"];
      const colors: Record<string, string> = {
        "Khuôn nhập kho": "#475569",
        "Thử khuôn": "#1d4ed8",
        "Gửi mẫu khách": "#a16207",
        "Nhà máy tự sửa": "#ea580c",
        "NCC đã lấy khuôn": "#7e22ce",
        "Khách duyệt (Sản xuất)": "#0f766e"
      };

      const dist = stats.status_distribution || {};
      const dataValues = defaultLabels.map(label => dist[label] || 0);
      const bgColors = defaultLabels.map(label => colors[label]);

      const totalData = dataValues.reduce((a, b) => a + b, 0);
      const finalData = totalData === 0 ? [1] : dataValues;
      const finalBg = totalData === 0 ? ["#e2e8f0"] : bgColors;
      const finalLabels = totalData === 0 ? ["Chưa có dữ liệu"] : defaultLabels;

      statusChartInstance.current = new Chart(statusChartRef.current, {
        type: 'doughnut',
        data: {
          labels: finalLabels,
          datasets: [{
            data: finalData,
            backgroundColor: finalBg,
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                font: { size: 11, family: 'Inter' }
              }
            }
          },
          cutout: '65%'
        }
      });
    }

    // 2. Vẽ Bar Chart (Nhà cung cấp)
    if (supplierChartRef.current) {
      if (supplierChartInstance.current) supplierChartInstance.current.destroy();

      const dist = stats.supplier_distribution || {};
      const labels = Object.keys(dist);
      const values = Object.values(dist);

      const finalLabels = labels.length === 0 ? ["Chưa có dữ liệu"] : labels;
      const finalValues = values.length === 0 ? [0] : values;

      supplierChartInstance.current = new Chart(supplierChartRef.current, {
        type: 'bar',
        data: {
          labels: finalLabels,
          datasets: [{
            label: 'Số lượng khuôn',
            data: finalValues,
            backgroundColor: '#4f35cd',
            borderRadius: 4,
            barPercentage: 0.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
                font: { size: 10, family: 'Inter' }
              },
              grid: { color: '#f1f5f9' }
            },
            x: {
              ticks: {
                font: { size: 10, family: 'Inter' }
              },
              grid: { display: false }
            }
          }
        }
      });
    }
  }, [activeTab, stats]);

  // --- File Upload Helper ---
  const uploadFilesForMold = async (code: string, files: File[], isAttachment: boolean) => {
    if (files.length === 0) return;
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });
    formData.append("is_attachment", String(isAttachment));

    try {
      const res = await fetch(`${API_BASE}/api/molds/${code}/files`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) {
        console.error("Không thể tải lên các tệp đính kèm.");
      }
    } catch (e) {
      console.error("Lỗi khi gọi API tải tệp tin:", e);
    }
  };

  // --- Form Handlers ---

  // Khai báo khuôn mới
  const handleCreateMold = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      code: newCode.trim().toUpperCase(),
      name: newName.trim(),
      supplier: newSupplier.trim(),
      import_date: newImportDate
    };

    try {
      const res = await fetch(`${API_BASE}/api/molds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        // Tải lên các hình ảnh gallery hoặc file đính kèm đã chọn
        await uploadFilesForMold(data.code, selectedImages, false);
        await uploadFilesForMold(data.code, selectedAttachments, true);

        alert(`Nhập kho thành công khuôn: ${data.code}`);
        setNewCode('');
        setNewName('');
        setNewSupplier('');
        setNewImportDate(new Date().toISOString().split('T')[0]);
        setSelectedImages([]);
        setSelectedAttachments([]);

        // Cập nhật state, đóng modal và xem chi tiết
        setSelectedMoldCode(data.code);
        await fetchMolds();
        setIsModalOpen(false);
        setActiveTab('lookup');
      } else {
        alert(`Lỗi: ${data.detail || "Không thể tạo khuôn."}`);
      }
    } catch {
      alert("Lỗi kết nối mạng khi khai báo khuôn.");
    }
  };

  // Cập nhật quy trình / trạng thái
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateMoldCode || !updateStatus) {
      alert("Vui lòng chọn khuôn và trạng thái mới.");
      return;
    }

    try {
      let res;
      let data;

      // Trạng thái LỖI (Nhà máy tự sửa / NCC đã lấy khuôn)
      if (updateStatus === 'Nhà máy tự sửa' || updateStatus === 'NCC đã lấy khuôn') {
        const formData = new FormData();
        formData.append("status", updateStatus);
        formData.append("technician", updateTechnician);
        formData.append("description", errorDesc.trim());
        formData.append("cause", errorCause.trim());
        formData.append("solution", errorSolution.trim());
        if (errorImageFile) {
          formData.append("image", errorImageFile);
        }
        if (repairDeadline) {
          formData.append("repair_deadline", repairDeadline);
        }
        if (updateStatus === 'NCC đã lấy khuôn' && supplierPickupStatus) {
          formData.append("supplier_pickup_status", supplierPickupStatus);
        }

        res = await fetch(`${API_BASE}/api/molds/${updateMoldCode}/error`, {
          method: "POST",
          body: formData
        });
      }
      // Trạng thái KHÁCH DUYỆT (NGHIỆM THU) - HỖ TRỢ UPLOAD FILE
      else if (updateStatus === 'Khách duyệt (Sản xuất)') {
        const formData = new FormData();
        formData.append("acceptance_feedback", acceptFeedback.trim());
        formData.append("technician", updateTechnician);
        if (acceptImageFile) {
          formData.append("image", acceptImageFile);
        }
        if (acceptAttachmentFile) {
          formData.append("attachment", acceptAttachmentFile);
        }

        res = await fetch(`${API_BASE}/api/molds/${updateMoldCode}/accept`, {
          method: "POST",
          body: formData
        });
      }
      // Trạng thái THÔNG THƯỜNG (Thử khuôn / Gửi mẫu khách)
      else {
        const payload = {
          status: updateStatus,
          notes: generalNotes.trim() || `Cập nhật trạng thái sang ${updateStatus}`,
          technician: updateTechnician
        };
        res = await fetch(`${API_BASE}/api/molds/${updateMoldCode}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      data = await res.json();

      if (res.ok) {
        // Tải các hình ảnh gallery hoặc tệp đính kèm kèm theo
        await uploadFilesForMold(updateMoldCode, selectedImages, false);
        await uploadFilesForMold(updateMoldCode, selectedAttachments, true);

        alert(`Cập nhật trạng thái khuôn ${updateMoldCode} thành công!`);
        
        // Reset form states
        setUpdateMoldCode('');
        setUpdateStatus('');
        setErrorDesc('');
        setErrorCause('');
        setErrorSolution('');
        setErrorImageFile(null);
        setRepairDeadline('');
        setSupplierPickupStatus('Nhà cung cấp hẹn lấy');
        setAcceptFeedback('');
        setAcceptImageFile(null);
        setAcceptAttachmentFile(null);
        setGeneralNotes('');
        setSelectedImages([]);
        setSelectedAttachments([]);

        // Đồng bộ, đóng modal và xem chi tiết
        setSelectedMoldCode(updateMoldCode);
        await fetchMolds();
        setIsModalOpen(false);
        setActiveTab('lookup');
      } else {
        alert(`Lỗi cập nhật: ${data.detail || "Thao tác thất bại."}`);
      }
    } catch {
      alert("Lỗi kết nối mạng khi cập nhật trạng thái.");
    }
  };

  // Xóa khuôn mẫu
  const handleDeleteMold = async (code: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa khuôn mẫu ${code} và tất cả nhật ký, hình ảnh, tài liệu đính kèm liên quan? Hành động này không thể hoàn tác.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/molds/${code}`, {
        method: "DELETE"
      });
      const data = await res.json();

      if (res.ok) {
        alert(data.detail || `Đã xóa thành công khuôn ${code}`);
        if (selectedMoldCode === code) {
          setSelectedMoldCode(null);
          setSelectedMoldDetail(null);
        }
        await fetchMolds();
        await fetchStats();
      } else {
        alert(`Lỗi khi xóa: ${data.detail || "Không thể thực hiện."}`);
      }
    } catch {
      alert("Lỗi mạng khi thực hiện xóa khuôn.");
    }
  };

  // Thêm trực tiếp ảnh vào gallery từ properties panel
  const handleQuickAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedMoldCode || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const formData = new FormData();
    formData.append("files", file);
    formData.append("is_attachment", "false");

    try {
      const res = await fetch(`${API_BASE}/api/molds/${selectedMoldCode}/files`, {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        // Tải lại chi tiết khuôn và thống kê
        await fetchMoldDetails(selectedMoldCode);
        await fetchStats();
      } else {
        alert("Lỗi tải lên hình ảnh mẫu.");
      }
    } catch {
      alert("Lỗi kết nối mạng khi tải ảnh.");
    }
  };

  // Xóa một ảnh hoặc tài liệu khỏi khuôn
  const handleDeleteFile = async (fileId: number) => {
    if (!window.confirm("Bạn có chắc muốn xóa tệp tin này khỏi hồ sơ khuôn?")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (selectedMoldCode) {
          await fetchMoldDetails(selectedMoldCode);
          await fetchStats();
        }
      } else {
        alert("Không thể xóa tệp tin.");
      }
    } catch {
      alert("Lỗi kết nối khi xóa tệp tin.");
    }
  };

  // Xuất CSV báo cáo
  const handleExportCSV = () => {
    if (molds.length === 0) {
      alert("Không có dữ liệu khuôn mẫu để xuất.");
      return;
    }

    let csvContent = "\uFEFF"; // BOM UTF-8
    csvContent += `"MÃ KHUÔN","TÊN KHUÔN","NHÀ CUNG CẤP","NGÀY NHẬP","TRẠNG THÁI"\n`;

    molds.forEach(mold => {
      csvContent += `"${mold.code.replace(/"/g, '""')}","${mold.name.replace(/"/g, '""')}","${mold.supplier.replace(/"/g, '""')}","${mold.import_date}","${mold.status.replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Bao_cao_danh_sach_khuon_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Kích hoạt Modal ở chế độ Sửa (Edit)
  const triggerQuickUpdate = (code: string) => {
    setUpdateMoldCode(code);
    setUpdateStatus('');
    setModalMode('update');
    setIsModalOpen(true);
  };

  // Kích hoạt Modal ở chế độ Tạo mới (Create)
  const triggerCreateNew = () => {
    setNewCode('');
    setNewName('');
    setNewSupplier('');
    setNewImportDate(new Date().toISOString().split('T')[0]);
    setSelectedImages([]);
    setSelectedAttachments([]);
    setModalMode('new');
    setIsModalOpen(true);
  };

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-box">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-icon">
              <path d="M4 6C4 4.89543 7.58172 4 12 4C16.4183 4 20 4.89543 20 6M4 6C4 7.10457 7.58172 8 12 8C16.4183 8 20 7.10457 20 6M4 6V12C4 13.1046 7.58172 14 12 14C16.4183 14 20 13.1046 20 12V6M4 12V18C4 19.1046 7.58172 20 12 20C16.4183 20 20 19.1046 20 18V12M20 12C20 12.1 19.98 12.2 19.95 12.3" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            </svg>
          </div>
          <div className="title-area">
            <h1>HỆ THỐNG QUẢN LÝ KHUÔN <span className="version-badge">v1.1</span></h1>
            <p className="subtitle">Báo cáo chạy thử, cập nhật lỗi kỹ thuật & lưu trữ database tập trung (React + TS)</p>
          </div>
        </div>
        <div className="header-right">
          <div className={`status-badge ${dbStatus.status === 'connected' ? 'status-connected' : dbStatus.status === 'disconnected' ? 'status-disconnected' : 'status-loading'}`}>
            <span className="pulse-dot"></span>
            <span className="status-text">
              {dbStatus.status === 'connected' ? 'Kết Nối VPS (Postgres)' : dbStatus.status === 'disconnected' ? 'Mất Kết Nối CSDL' : 'Đang kết nối...'}
            </span>
          </div>
          <div className="date-badge">
            {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="app-nav">
        <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="nav-icon"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
          Dashboard Thống Kê
        </button>
        <button className={`nav-item ${activeTab === 'lookup' ? 'active' : ''}`} onClick={() => setActiveTab('lookup')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="nav-icon"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          Tra Cứu & Dữ Liệu
        </button>
        <button className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => { setActiveTab('config'); fetchDbStatus(); fetchZaloNotifications(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="nav-icon"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          Cấu Hình & Đồng Bộ
        </button>
      </nav>

      {/* MAIN PANELS CONTENT */}
      <main className="app-main-content">

        {/* 1. DASHBOARD PANEL */}
        {activeTab === 'dashboard' && (
          <section className="tab-panel active">
            <div className="stats-cards-grid">
              <div className="stats-card">
                <div className="card-content">
                  <span className="card-title">Tổng Số Khuôn</span>
                  <span className="card-value">{stats.total}</span>
                </div>
                <div className="card-icon-box purple">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="card-icon"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                </div>
              </div>
              <div className="stats-card">
                <div className="card-content">
                  <span className="card-title">Đang Thử Khuôn</span>
                  <span className="card-value">{stats.testing}</span>
                </div>
                <div className="card-icon-box blue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="card-icon"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                </div>
              </div>
              <div className="stats-card">
                <div className="card-content">
                  <span className="card-title">Đang Lỗi / Sửa Chữa</span>
                  <span className="card-value">{stats.error}</span>
                </div>
                <div className="card-icon-box red">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="card-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
              </div>
              <div className="stats-card">
                <div className="card-content">
                  <span className="card-title">Đã Nghiệm Thu (Khách duyệt)</span>
                  <span className="card-value">{stats.accepted}</span>
                </div>
                <div className="card-icon-box green">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="card-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                </div>
              </div>
            </div>

            <div className="charts-container">
              <div className="chart-box">
                <div className="chart-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="chart-header-icon"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  <div>
                    <h3>Phân Loại Trạng Thái Khuôn</h3>
                    <p>Biểu đồ thể hiện tình trạng hoạt động thực tế của toàn bộ khuôn</p>
                  </div>
                </div>
                <div className="chart-body donut-chart-container">
                  <canvas ref={statusChartRef} id="chart-status"></canvas>
                </div>
              </div>
              <div className="chart-box">
                <div className="chart-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="chart-header-icon"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                  <div>
                    <h3>Phân Bổ Theo Nhà Cung Cấp</h3>
                    <p>Số lượng khuôn chế tạo và bàn giao bởi mỗi đối tác cơ khí</p>
                  </div>
                </div>
                <div className="chart-body">
                  <canvas ref={supplierChartRef} id="chart-supplier"></canvas>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. LOOKUP & DATA PANEL (Split View) */}
        {activeTab === 'lookup' && (
          <section className="tab-panel active">
            <div className="lookup-grid-layout">
              {/* Cột Trái: Danh sách */}
              <div className="lookup-left-pane">
                <div className="search-filter-bar">
                  <div className="search-input-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="search-bar-icon"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input type="text" id="search-input" placeholder="Nhập mã khuôn, tên khuôn hoặc nhà cung cấp..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                  <div className="filter-dropdown-wrapper">
                    <select id="filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                      <option value="Tất cả trạng thái">Tất cả trạng thái</option>
                      <option value="Khuôn nhập kho">Khuôn nhập kho</option>
                      <option value="Thử khuôn">Thử khuôn</option>
                      <option value="Gửi mẫu khách">Gửi mẫu khách</option>
                      <option value="Nhà máy tự sửa">Nhà máy tự sửa</option>
                      <option value="NCC đã lấy khuôn">NCC đã lấy khuôn</option>
                      <option value="Khách duyệt (Sản xuất)">Khách duyệt (Sản xuất)</option>
                    </select>
                  </div>
                  
                  {/* NÚT THÊM MỚI (Mở modal ở Create mode) */}
                  <button onClick={triggerCreateNew} className="btn-primary" style={{ padding: '10px 16px', fontSize: '13px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Khai báo khuôn mới
                  </button>

                  <button onClick={handleExportCSV} className="btn-secondary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="btn-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                    Xuất CSV
                  </button>
                </div>

                <div className="table-container">
                  <table className="molds-table">
                    <thead>
                      <tr>
                        <th>MÃ KHUÔN</th>
                        <th>TÊN KHUÔN</th>
                        <th>NHÀ CUNG CẤP</th>
                        <th>NGÀY NHẬP</th>
                        <th>TRẠNG THÁI</th>
                        <th style={{ width: '110px' }}>THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {molds.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="form-empty-state">Không tìm thấy khuôn phù hợp.</td>
                        </tr>
                      ) : (
                        molds.map(mold => {
                          let statusClass = "import";
                          if (mold.status === "Thử khuôn") statusClass = "trial";
                          else if (mold.status === "Nhà máy tự sửa") statusClass = "selfrepair";
                          else if (mold.status === "NCC đã lấy khuôn") statusClass = "supplier";
                          else if (mold.status === "Gửi mẫu khách") statusClass = "sample";
                          else if (mold.status === "Khách duyệt (Sản xuất)") statusClass = "accepted";

                          return (
                            <tr key={mold.code} className={selectedMoldCode === mold.code ? 'selected' : ''} onClick={() => setSelectedMoldCode(mold.code)}>
                              <td><strong>{mold.code}</strong></td>
                              <td>{mold.name}</td>
                              <td>{mold.supplier}</td>
                              <td>{mold.import_date}</td>
                              <td><span className={`status-pill ${statusClass}`}>{mold.status}</span></td>
                              <td>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {/* Xem chi tiết */}
                                  <button className="detail-view-trigger" onClick={(e) => { e.stopPropagation(); setSelectedMoldCode(mold.code); }} title="Xem hồ sơ khuôn">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: '16px', height: '16px' }}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                                  </button>
                                  {/* SỬA / CẬP NHẬT QUY TRÌNH */}
                                  <button className="edit-icon-btn" onClick={(e) => { e.stopPropagation(); triggerQuickUpdate(mold.code); }} title="Cập nhật quy trình">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="edit-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" /></svg>
                                  </button>
                                  {/* XÓA KHUÔN (Nút mới) */}
                                  <button className="delete-icon-btn" onClick={(e) => { e.stopPropagation(); handleDeleteMold(mold.code); }} title="Xóa khuôn khỏi xưởng">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="edit-icon"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-footer">
                  <span>Hiển thị: {molds.length} / {molds.length} khuôn sản xuất</span>
                  <span>Cập nhật liên tục từ cơ sở dữ liệu</span>
                </div>
              </div>

              {/* Cột Phải: Xem chi tiết */}
              <div className="lookup-right-pane">
                {!selectedMoldDetail ? (
                  <div className="detail-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="empty-icon"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    <p>Chọn một khuôn từ danh sách bên trái để xem hồ sơ chi tiết, nhật ký báo lỗi và lịch sử vận hành.</p>
                  </div>
                ) : (
                  <div className="detail-panel-card">
                    <div className="detail-header">
                      <div className="detail-title-block">
                        <h2>{selectedMoldDetail.code}</h2>
                        <h3>{selectedMoldDetail.name}</h3>
                        <p className="supplier-info">Nhà cung cấp: {selectedMoldDetail.supplier}</p>
                      </div>
                      <button className="btn-badge-action" onClick={() => triggerQuickUpdate(selectedMoldDetail.code)}>
                        Cập nhật &rarr;
                      </button>
                    </div>

                    {/* DÃY HÌNH THUMBNAIL (GALLERY - KIỂU ADMAKE) */}
                    <div className="properties-gallery-container">
                      <div className="properties-gallery-strip">
                        {/* Hiển thị các hình ảnh của khuôn */}
                        {selectedMoldDetail.files?.filter(f => !f.is_attachment).map(file => (
                          <div key={file.id} className="gallery-thumbnail-wrapper" onClick={() => setLightboxImgUrl(`${API_BASE}${file.file_url}`)}>
                            <img src={`${API_BASE}${file.file_url}`} alt={file.file_name} />
                            {/* Nút Xóa ảnh gallery nhanh */}
                            <button className="gallery-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }} title="Xóa ảnh khỏi gallery">
                              &times;
                            </button>
                          </div>
                        ))}
                        
                        {/* Nút ADD hình ảnh nhanh */}
                        <div className="gallery-add-btn" onClick={() => hiddenGalleryInputRef.current?.click()} title="Thêm ảnh mẫu mới">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="gallery-add-icon"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          <span>+ ADD</span>
                        </div>
                        
                        <input type="file" ref={hiddenGalleryInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleQuickAddImage} />
                      </div>
                    </div>

                    <div className="detail-body">
                      {/* Trạng thái hiện tại */}
                      <div className="detail-status-row">
                        <span className="info-label">Trạng thái hiện tại:</span>
                        <span className={`status-badge-styled ${
                          selectedMoldDetail.status === 'Thử khuôn' ? 'trial' :
                          selectedMoldDetail.status === 'Nhà máy tự sửa' ? 'selfrepair' :
                          selectedMoldDetail.status === 'NCC đã lấy khuôn' ? 'supplier' :
                          selectedMoldDetail.status === 'Gửi mẫu khách' ? 'sample' :
                          selectedMoldDetail.status === 'Khách duyệt (Sản xuất)' ? 'accepted' : 'import'
                        }`}>
                          {selectedMoldDetail.status}
                        </span>
                      </div>

                      {/* Ngày nhập kho */}
                      <div className="detail-info-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="row-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <div>
                          <span className="info-label">Ngày nhập kho:</span>
                          <span className="info-val">{selectedMoldDetail.import_date}</span>
                        </div>
                      </div>

                      {/* TÀI LIỆU ĐÍNH KÈM (PDF / ZIP / EXCEL) */}
                      {selectedMoldDetail.files?.filter(f => f.is_attachment).length > 0 && (
                        <div className="attachments-list-container">
                          <h4>TÀI LIỆU ĐÍNH KÈM</h4>
                          {selectedMoldDetail.files.filter(f => f.is_attachment).map(file => (
                            <div key={file.id} className="attachment-item">
                              <a href={`${API_BASE}${file.file_url}`} target="_blank" rel="noreferrer" className="attach-link" title="Mở / Tải tài liệu">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="attach-icon"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                                {file.file_name}
                              </a>
                              <button className="delete-icon-btn" onClick={() => handleDeleteFile(file.id)} title="Gỡ tài liệu" style={{ padding: '2px' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '14px', height: '14px' }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* NHẬT KÝ BÁO LỖI (Trạng thái sự cố) */}
                      {(selectedMoldDetail.status === 'Nhà máy tự sửa' || selectedMoldDetail.status === 'NCC đã lấy khuôn') && selectedMoldDetail.error_logs?.length > 0 && (
                        <div className="detail-section-box error-box">
                          <h4 className="section-title text-red">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="section-title-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            NHẬT KÝ BÁO LỖI
                          </h4>
                          <div className="error-details">
                            <p><strong>Mô tả lỗi:</strong> {selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].description}</p>
                            <p><strong>Nguyên nhân:</strong> {selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].cause || 'Chưa xác định'}</p>
                            <p><strong>Hướng xử lý:</strong> {selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].solution || 'Đang lập kế hoạch sửa đổi'}</p>
                            {selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].repair_deadline && (
                              <p><strong>Hạn chót sửa chữa (Deadline):</strong> <span className="text-red" style={{ fontWeight: 700 }}>{selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].repair_deadline}</span></p>
                            )}
                            {selectedMoldDetail.status === 'NCC đã lấy khuôn' && selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].supplier_pickup_status && (
                              <p><strong>Trạng thái giao nhận của NCC:</strong> <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].supplier_pickup_status}</span></p>
                            )}
                            
                            {selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].image_url && (
                              <div className="error-image-wrapper">
                                <p className="img-label">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="img-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                  Hình ảnh chi tiết lỗi:
                                </p>
                                <div className="image-zoom-box" onClick={() => setLightboxImgUrl(`${API_BASE}${selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].image_url}`)} style={{ cursor: 'pointer' }}>
                                  <img src={`${API_BASE}${selectedMoldDetail.error_logs[selectedMoldDetail.error_logs.length - 1].image_url}`} alt="Hình ảnh lỗi kỹ thuật" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* KÝ DUYỆT NGHIỆM THU */}
                      {selectedMoldDetail.status === 'Khách duyệt (Sản xuất)' && (
                        <div className="detail-section-box success-box">
                          <h4 className="section-title text-green">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="section-title-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                            ĐÃ KÝ DUYỆT NGHIỆM THU
                          </h4>
                          <div className="accept-details">
                            <p><strong>Ngày phản hồi:</strong> {selectedMoldDetail.acceptance_date}</p>
                            <p><strong>Nhận xét:</strong> {selectedMoldDetail.acceptance_feedback}</p>
                            {selectedMoldDetail.acceptance_image_url && (
                              <div className="error-image-wrapper" style={{ marginTop: '10px' }}>
                                <p className="img-label">📸 Hình ảnh mẫu nghiệm thu:</p>
                                <div className="image-zoom-box" onClick={() => setLightboxImgUrl(`${API_BASE}${selectedMoldDetail.acceptance_image_url}`)} style={{ cursor: 'pointer' }}>
                                  <img src={`${API_BASE}${selectedMoldDetail.acceptance_image_url}`} alt="Ảnh mẫu nghiệm thu đạt" />
                                </div>
                              </div>
                            )}
                            {selectedMoldDetail.acceptance_attachment_url && (
                              <div className="attachment-item" style={{ marginTop: '10px', backgroundColor: '#ffffff' }}>
                                <a href={`${API_BASE}${selectedMoldDetail.acceptance_attachment_url}`} target="_blank" rel="noreferrer" className="attach-link" title="Tải tài liệu biên bản">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="attach-icon"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                                  {selectedMoldDetail.acceptance_attachment_name || 'Biên bản nghiệm thu đính kèm'}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* LỊCH SỬ GIAO DỊCH */}
                      <div className="detail-section">
                        <h4 id="detail-logs-count-title">NHẬT KÝ GIAO DỊCH ({selectedMoldDetail.transaction_logs?.length || 0})</h4>
                        <div className="timeline-container">
                          {selectedMoldDetail.transaction_logs?.length === 0 ? (
                            <p className="form-empty-state" style={{ padding: '10px 0' }}>Chưa có sự kiện nào.</p>
                          ) : (
                            [...selectedMoldDetail.transaction_logs]
                              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                              .map(log => {
                                let itemClass = "import";
                                if (log.status === "Thử khuôn") itemClass = "trial";
                                else if (log.status === "Nhà máy tự sửa") itemClass = "selfrepair";
                                else if (log.status === "NCC đã lấy khuôn") itemClass = "supplier";
                                else if (log.status === "Gửi mẫu khách") itemClass = "sample";
                                else if (log.status === "Khách duyệt (Sản xuất)") itemClass = "accepted";

                                return (
                                  <div key={log.id} className={`timeline-item ${itemClass}`}>
                                    <div className="timeline-header">
                                      <span className="timeline-status">{log.status}</span>
                                      <span className="timeline-time">{formatTime(log.created_at)}</span>
                                    </div>
                                    <p className="timeline-notes">{log.notes}</p>
                                    <p className="timeline-author">&bull; {log.technician}</p>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 3. CONFIGURATION PANEL */}
        {activeTab === 'config' && (
          <section className="tab-panel active">
            <div className="config-banner-box">
              <div className="banner-icon-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="banner-icon"><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
              </div>
              <div className="banner-text">
                <h2>Chế Độ Lưu Trữ Cơ Sở Dữ Liệu Tập Trung (PostgreSQL)</h2>
                <p>Mọi thao tác thay đổi dữ liệu, thêm khuôn mẫu mới được lưu trữ và quản lý trực tiếp tại hệ quản trị cơ sở dữ liệu PostgreSQL trên máy chủ VPS. Đảm bảo hiệu năng ổn định, an toàn và dễ dàng mở rộng.</p>
              </div>
            </div>

            <div className="config-grid-layout">
              {/* Form Config */}
              <div className="config-form-pane">
                <h3>Cấu Hình Đường Dẫn Kết Nối</h3>
                <form>
                  <div className="form-group">
                    <label htmlFor="config-db-url">POSTGRESQL DATABASE URL *</label>
                    <input type="text" id="config-db-url" readOnly placeholder="postgresql://username:password@host:port/database" value={dbStatus.database} />
                    <p className="field-desc">Dữ liệu đọc trực tiếp từ cấu hình biến môi trường của máy chủ (.env)</p>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="config-db-status">TRẠNG THÁI KẾT NỐI</label>
                      <input type="text" id="config-db-status" readOnly value={dbStatus.status === 'connected' ? 'Hoạt động bình thường (Connected)' : dbStatus.status === 'disconnected' ? 'Mất Kết Nối CSDL' : 'Đang kết nối...'} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="config-db-type">KIỂU CƠ SỞ DỮ LIỆU</label>
                      <input type="text" id="config-db-type" readOnly value={dbStatus.database.includes('SQLite') ? 'SQLite Database File' : 'PostgreSQL Database Server'} />
                    </div>
                  </div>
                  <div className="form-actions-horizontal">
                    <button type="button" onClick={() => fetchDbStatus()} className="btn-primary">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="btn-icon"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg>
                      Tự Động Kiểm Tra & Kết Nối Lại
                    </button>
                  </div>
                </form>
              </div>

              {/* Guide */}
              <div className="config-guide-pane">
                <h3>Hướng Dẫn Liên Kết</h3>
                <p className="guide-intro">Hệ thống quản lý khuôn mẫu phiên bản v1.1 sử dụng kiến trúc Client-Server (React + TS):</p>
                <ol className="guide-list">
                  <li>
                    <strong>Lưu trữ tập trung (VPS):</strong> Toàn bộ dữ liệu của các khuôn được đồng bộ thời gian thực thông qua cơ sở dữ liệu PostgreSQL. Hỗ trợ nhiều người dùng truy cập từ các thiết bị khác nhau tại nhà xưởng.
                  </li>
                  <li>
                    <strong>Lưu trữ hình ảnh trực tiếp:</strong> Ảnh lỗi đính kèm được tải trực tiếp lên VPS của công ty thông qua API, không qua trung gian giúp đảm bảo tính bảo mật và tốc độ phản hồi tối ưu.
                  </li>
                </ol>
                <div className="guide-notes-box">
                  <strong>CÁCH KẾT NỐI TRÊN VPS PRODUCTION:</strong>
                  <p>1. Cài đặt PostgreSQL trên VPS Ubuntu/Debian.</p>
                  <p>2. Chỉnh sửa biến <code>DATABASE_URL</code> trong file <code>.env</code> tại thư mục chạy backend.</p>
                  <p>3. Khởi động lại dịch vụ backend Python (Uvicorn), hệ thống sẽ tự động cấu hình lại bảng dữ liệu.</p>
                </div>
              </div>
            </div>

            {/* TÍCH HỢP THÔNG BÁO ZALO & TỔNG QUAN TÍNH NĂNG */}
            <div className="zalo-integration-container" style={{ marginTop: '24px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', padding: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ backgroundColor: '#e0f2fe', padding: '10px', borderRadius: '50%', color: '#0284c7' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: '24px', height: '24px' }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Tích Hợp Hệ Thống Thông Báo Zalo</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Mô phỏng tin nhắn Zalo gửi tự động cho Thợ khuôn, QC thử khuôn, và Quản lý</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>NHÂN SỰ VÀ KỊCH BẢN THÔNG BÁO</h4>
                    <ul style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.8' }}>
                      <li><strong>Thợ khuôn:</strong> Tự động nhận tin nhắn Zalo khi được phân công sửa chữa (kèm lỗi, vị trí hỏng và deadline hoàn thành).</li>
                      <li><strong>QC thử khuôn:</strong>QC gửi nhanh kết quả Đạt / Không đạt chạy thử mẫu khuôn, đính kèm hình ảnh và chú thích kỹ thuật trực tiếp tới nhóm.</li>
                      <li><strong>Quản lý:</strong> Nắm thông tin báo cáo tổng quan thời gian thực và nhắc nhở các sự cố trễ hạn xử lý.</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>TỔNG QUAN TÍNH NĂNG CHÍNH HỆ THỐNG (5 DÒNG)</h4>
                    <ol style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.8', listStyleType: 'decimal' }}>
                      <li>Quản lý vòng đời khuôn mẫu trực quan từ khâu nhập kho, chạy thử, báo lỗi cho đến khi bàn giao sản xuất.</li>
                      <li>Cập nhật quy trình chạy thử linh hoạt, phân tách rõ ràng chế độ tự sửa chữa hoặc gửi nhà cung cấp bảo hành.</li>
                      <li>Theo dõi chi tiết sự cố kỹ thuật qua nhật ký báo lỗi trực quan kèm hình ảnh (hỗ trợ Ctrl+V) và tệp đính kèm.</li>
                      <li>Quản lý trực tiếp thời hạn (deadline) sửa chữa và trạng thái lấy khuôn của nhà cung cấp trên bảng điều khiển.</li>
                      <li>Hệ thống thống kê dashboard thông minh và xuất báo cáo CSV phục vụ quản lý và ra quyết định thời gian thực.</li>
                    </ol>
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>LỊCH SỬ TIN NHẮN ZALO ĐÃ GỬI ({zaloNotifs.length})</h4>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={fetchZaloNotifications}>
                      Tải lại
                    </button>
                  </div>

                  <div style={{ height: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '12px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {zaloNotifs.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', marginTop: '100px' }}>
                        Chưa có thông báo Zalo nào được kích hoạt. Hãy thử tạo mới khuôn hoặc cập nhật trạng thái khuôn (Thử khuôn, Nhà máy tự sửa, Ký duyệt...).
                      </div>
                    ) : (
                      zaloNotifs.map(notif => {
                        let recipientColor = '#0369a1';
                        if (notif.recipient === 'Thợ khuôn') recipientColor = '#ea580c';
                        else if (notif.recipient === 'QC') recipientColor = '#1d4ed8';

                        return (
                          <div key={notif.id} style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px', boxShadow: 'var(--shadow-sm)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
                              <span style={{ fontWeight: 700, color: recipientColor, backgroundColor: recipientColor + '15', padding: '2px 6px', borderRadius: '4px' }}>
                                Gửi: {notif.recipient}
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {formatTime(notif.created_at)}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                              {notif.message}
                            </p>
                            {notif.image_url && (
                              <div style={{ marginTop: '8px', cursor: 'pointer' }} onClick={() => setLightboxImgUrl(`${API_BASE}${notif.image_url}`)}>
                                <img src={`${API_BASE}${notif.image_url}`} alt="Zalo attachment" style={{ maxWidth: '80px', maxHeight: '60px', borderRadius: '4px', border: '1px solid var(--border-color)', objectFit: 'cover' }} />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ==========================================================================
         SINGLE DATA ENTRY MODAL (Tương tự Admake)
         ========================================================================== */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'new' ? 'KHAI BÁO KHUÔN NHẬP KHO MỚI' : 'CẬP NHẬT QUY TRÌNH CHẠY THỬ / SỬA KHUÔN'}</h2>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)} title="Đóng cửa sổ">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {/* CHẾ ĐỘ 1: KHAI BÁO MỚI */}
              {modalMode === 'new' && (
                <form onSubmit={handleCreateMold}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="new-code">MÃ KHUÔN (DUY NHẤT) *</label>
                      <input type="text" id="new-code" required placeholder="E.G. MK-NAP-24" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} pattern="^[a-zA-Z0-9\-_]+$" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="new-name">TÊN KHUÔN SẢN XUẤT *</label>
                      <input type="text" id="new-name" required placeholder="E.G. KHUÔN NẮP CHAI CỔ 28MM" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="new-supplier">ĐƠN VỊ CHẾ TẠO / NHÀ CUNG CẤP *</label>
                      <input type="text" id="new-supplier" required placeholder="E.G. CƠ KHÍ KHUÔN MẪU MINH ĐỨC" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="new-import-date">NGÀY NHẬP KHO *</label>
                      <input type="date" id="new-import-date" required value={newImportDate} onChange={(e) => setNewImportDate(e.target.value)} />
                    </div>
                  </div>

                  {/* THÊM FILE ĐÍNH KÈM KHI KHAI BÁO MỚI */}
                  <div className="form-row" style={{ marginTop: '16px' }}>
                    <div className="form-group">
                      <label>HÌNH ẢNH MẪU ĐẦU TIÊN (HỖ TRỢ CTRL+V)</label>
                      <div className="upload-drop-zone" onClick={() => document.getElementById('modal-img-picker')?.click()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="upload-drop-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        <span>Nhấn để chọn ảnh mẫu hoặc <b>bấm Ctrl+V</b> để dán ảnh</span>
                      </div>
                      <input type="file" id="modal-img-picker" style={{ display: 'none' }} accept="image/*" multiple onChange={(e) => {
                        if (e.target.files) setSelectedImages(prev => [...prev, ...Array.from(e.target.files!)]);
                      }} />
                      
                      {selectedImages.length > 0 && (
                        <div className="selected-files-preview">
                          {selectedImages.map((file, i) => (
                            <div key={i} className="preview-file-badge">
                              <span>📸 {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                              <button type="button" className="preview-file-remove" onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="form-group">
                      <label>TÀI LIỆU KÈM THEO (.PDF, .ZIP, .XLSX...)</label>
                      <div className="upload-drop-zone" onClick={() => document.getElementById('modal-doc-picker')?.click()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="upload-drop-icon"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                        <span>Nhấn để chọn tệp tài liệu / bản vẽ đính kèm</span>
                      </div>
                      <input type="file" id="modal-doc-picker" style={{ display: 'none' }} accept=".pdf,.zip,.rar,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => {
                        if (e.target.files) setSelectedAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                      }} />
                      
                      {selectedAttachments.length > 0 && (
                        <div className="selected-files-preview">
                          {selectedAttachments.map((file, i) => (
                            <div key={i} className="preview-file-badge">
                              <span>📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                              <button type="button" className="preview-file-remove" onClick={() => setSelectedAttachments(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-actions" style={{ marginTop: '24px' }}>
                    <button type="submit" className="btn-primary">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="btn-icon"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                      Hoàn Tất Nhập Kho
                    </button>
                  </div>
                </form>
              )}

              {/* CHẾ ĐỘ 2: CẬP NHẬT TRẠNG THÁI */}
              {modalMode === 'update' && (
                <form onSubmit={handleUpdateStatus}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="update-select-mold">CHỌN KHUÔN CẦN CẬP NHẬT *</label>
                      <select id="update-select-mold" required value={updateMoldCode} onChange={(e) => setUpdateMoldCode(e.target.value)}>
                        <option value="" disabled>-- Click chọn mã khuôn đang quản lý --</option>
                        {molds.map(m => (
                          <option key={m.code} value={m.code}>{m.code} - {m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="update-technician">HỌ TÊN NGƯỜI CẬP NHẬT *</label>
                      <div className="input-with-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="input-icon-svg"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        <input type="text" id="update-technician" required value={updateTechnician} onChange={(e) => setUpdateTechnician(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="form-group status-update-group">
                    <label htmlFor="update-status">CẬP NHẬT TRẠNG THÁI MỚI *</label>
                    <select id="update-status" required value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value)}>
                      <option value="" disabled>-- Chọn trạng thái cập nhật tiếp theo --</option>
                      <option value="Thử khuôn">Thử khuôn (Chạy thử mẫu)</option>
                      <option value="Gửi mẫu khách">Gửi mẫu khách (Khách duyệt mẫu)</option>
                      <option value="Nhà máy tự sửa">Nhà máy tự sửa (Phát hiện lỗi & tự khắc phục)</option>
                      <option value="NCC đã lấy khuôn">NCC đã lấy khuôn (Chuyển trả đơn vị chế tạo sửa)</option>
                      <option value="Khách duyệt (Sản xuất)">Khách duyệt (Sản xuất) (Ký duyệt nghiệm thu)</option>
                    </select>
                  </div>

                  {/* TRƯỜNG ĐỘNG CHO TRẠNG THÁI LỖI */}
                  {(updateStatus === 'Nhà máy tự sửa' || updateStatus === 'NCC đã lấy khuôn') && (
                    <div className="dynamic-form-fields">
                      <div className="form-group">
                        <label htmlFor="error-desc">MÔ TẢ LỖI PHÁT SINH (CHI TIẾT) *</label>
                        <textarea id="error-desc" required placeholder="Mô tả hiện tượng lỗi (Ví dụ: Sản phẩm bị ba bớ nặng dính ở cuống phun, áp lực phun không cân bằng)" value={errorDesc} onChange={(e) => setErrorDesc(e.target.value)}></textarea>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="error-cause">NGUYÊN NHÂN GÂY LỖI</label>
                          <textarea id="error-cause" placeholder="Nguyên nhân dự đoán từ kỹ thuật (Ví dụ: Kích thước cổng phun gate nhỏ hơn thiết kế 0.15mm)" value={errorCause} onChange={(e) => setErrorCause(e.target.value)}></textarea>
                        </div>
                        <div className="form-group">
                          <label htmlFor="error-solution">HƯỚNG XỬ LÝ / KHẮC PHỤC</label>
                          <textarea id="error-solution" placeholder="Hướng khắc phục đề xuất (Ví dụ: Mở rộng cổng gate, xưởng tự hàn/sửa tiện)" value={errorSolution} onChange={(e) => setErrorSolution(e.target.value)}></textarea>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="repair-deadline">HẠN CHÓT HOÀN THÀNH (DEADLINE) *</label>
                          <input type="date" id="repair-deadline" required value={repairDeadline} onChange={(e) => setRepairDeadline(e.target.value)} />
                        </div>
                        {updateStatus === 'NCC đã lấy khuôn' && (
                          <div className="form-group">
                            <label htmlFor="supplier-pickup-status">TÌNH TRẠNG GIAO NHẬN CỦA NCC *</label>
                            <select id="supplier-pickup-status" required value={supplierPickupStatus} onChange={(e) => setSupplierPickupStatus(e.target.value)}>
                              <option value="Nhà cung cấp hẹn lấy">Nhà cung cấp hẹn lấy</option>
                              <option value="Nhà cung cấp không lấy">Nhà cung cấp không lấy</option>
                              <option value="Đã trả hàng sau khi sửa xong">Đã trả hàng sau khi sửa xong</option>
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="form-group">
                        <label htmlFor="error-image">HÌNH ẢNH CHI TIẾT LỖI BAN ĐẦU</label>
                        <input type="file" id="error-image" accept="image/*" className="file-input-styled" onChange={(e) => setErrorImageFile(e.target.files ? e.target.files[0] : null)} />
                        <p className="file-help">Tải ảnh chụp sự cố trực tiếp của lần sửa đổi này lên</p>
                      </div>
                    </div>
                  )}

                  {/* TRƯỜNG ĐỘNG CHO TRẠNG THÁI NGHIỆM THU */}
                  {updateStatus === 'Khách duyệt (Sản xuất)' && (
                    <div className="dynamic-form-fields">
                      <div className="form-group">
                        <label htmlFor="accept-feedback">NHẬN XÉT CỦA KHÁCH HÀNG (KÝ DUYỆT) *</label>
                        <textarea id="accept-feedback" required placeholder="Ý kiến phản hồi từ phía khách hàng (Ví dụ: Sản phẩm đạt yêu cầu về độ bóng bề mặt và độ khít nắp hộp. Chấp thuận chạy sản xuất đại trà.)" value={acceptFeedback} onChange={(e) => setAcceptFeedback(e.target.value)}></textarea>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="accept-image">HÌNH ẢNH MINH HỌA NGHIỆM THU</label>
                          <input type="file" id="accept-image" accept="image/*" className="file-input-styled" onChange={(e) => setAcceptImageFile(e.target.files ? e.target.files[0] : null)} />
                          <p className="file-help">Tải ảnh sản phẩm mẫu nghiệm thu đạt yêu cầu</p>
                        </div>
                        <div className="form-group">
                          <label htmlFor="accept-attachment">BẢN VẼ / BIÊN BẢN KÝ DUYỆT ĐÍNH KÈM</label>
                          <input type="file" id="accept-attachment" accept=".pdf,.zip,.rar,.doc,.docx,.xls,.xlsx" className="file-input-styled" onChange={(e) => setAcceptAttachmentFile(e.target.files ? e.target.files[0] : null)} />
                          <p className="file-help">Đính kèm biên bản nghiệm thu hoặc bản vẽ kỹ thuật đã ký (.pdf, .zip...)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TRƯỜNG ĐỘNG GHI CHÚ CHUNG CHO THỬ KHUÔN / GỬI MẪU KHÁCH */}
                  {updateStatus && updateStatus !== 'Nhà máy tự sửa' && updateStatus !== 'NCC đã lấy khuôn' && updateStatus !== 'Khách duyệt (Sản xuất)' && (
                    <div className="form-group" style={{ marginTop: '16px' }}>
                      <label htmlFor="update-notes">GHI CHÚ / CHI TIẾT GIAO DỊCH</label>
                      <textarea id="update-notes" placeholder="Mô tả ngắn gọn nội dung cập nhật (Ví dụ: Lắp khuôn lên máy số 5 chạy thử mẫu lần 2)" value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)}></textarea>
                    </div>
                  )}

                  {/* HỖ TRỢ UPLOAD HÌNH ẢNH / TÀI LIỆU KÈM THEO TRONG CẬP NHẬT TRẠNG THÁI */}
                  {updateStatus && (
                    <div className="form-row" style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                      <div className="form-group">
                        <label>ẢNH THỰC TẾ GIAO DỊCH (HỖ TRỢ CTRL+V)</label>
                        <div className="upload-drop-zone" onClick={() => document.getElementById('modal-update-img')?.click()}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="upload-drop-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                          <span>Nhấn để chọn ảnh hoặc <b>bấm Ctrl+V</b> để dán ảnh</span>
                        </div>
                        <input type="file" id="modal-update-img" style={{ display: 'none' }} accept="image/*" multiple onChange={(e) => {
                          if (e.target.files) setSelectedImages(prev => [...prev, ...Array.from(e.target.files!)]);
                        }} />
                        
                        {selectedImages.length > 0 && (
                          <div className="selected-files-preview">
                            {selectedImages.map((file, i) => (
                              <div key={i} className="preview-file-badge">
                                <span>📸 {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                                <button type="button" className="preview-file-remove" onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label>TÀI LIỆU / PHIẾU BÀN GIAO ĐÍNH KÈM</label>
                        <div className="upload-drop-zone" onClick={() => document.getElementById('modal-update-doc')?.click()}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="upload-drop-icon"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                          <span>Chọn tài liệu giao dịch đi kèm (.pdf, .zip, .xlsx...)</span>
                        </div>
                        <input type="file" id="modal-update-doc" style={{ display: 'none' }} accept=".pdf,.zip,.rar,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => {
                          if (e.target.files) setSelectedAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                        }} />
                        
                        {selectedAttachments.length > 0 && (
                          <div className="selected-files-preview">
                            {selectedAttachments.map((file, i) => (
                              <div key={i} className="preview-file-badge">
                                <span>📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                                <button type="button" className="preview-file-remove" onClick={() => setSelectedAttachments(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="form-actions" style={{ marginTop: '24px' }}>
                    <button type="submit" className="btn-primary">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      Xác Nhận Cập Nhật Quy Trình
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
         LIGHTBOX OVERLAY (Xem ảnh full-size phóng to)
         ========================================================================== */}
      {lightboxImgUrl && (
        <div className="lightbox-backdrop" onClick={() => setLightboxImgUrl(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxImgUrl(null)}>
              &times;
            </button>
            <img src={lightboxImgUrl} alt="Phóng to ảnh mẫu" />
          </div>
        </div>
      )}
    </div>
  );
}
