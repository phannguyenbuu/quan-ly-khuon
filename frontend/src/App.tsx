import React, { useState, useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

// Định nghĩa base URL: kết nối trực tiếp tới Backend VPS (https://mould.n-lux.com)
const API_BASE = import.meta.env.VITE_API_URL || 'https://mould.n-lux.com';

// --- Interfaces & Types ---






interface Mold {
  code: string;
  name: string;
  supplier: string;
  import_date: string;
  status: string;
  acceptance_date?: string;
  acceptance_feedback?: string;
}

interface MoldEvent {
  id: number;
  mold_code: string;
  type: string;
  name: string;
  content?: string;
  created_at: string;
  updated_at: string;
  tagged_staff?: string;
  images?: string;
  attachments?: string;
}

interface MoldDetail extends Mold {
  events: MoldEvent[];
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
  // Helper functions for horizontal infographic timeline
  const getClipPath = (index: number, total: number) => {
    if (total <= 1) return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
    if (index === 0) return 'polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%)';
    if (index === total - 1) return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 10px 50%)';
    return 'polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 10px 50%)';
  };

  const getEventIcon = (event: any) => {
    if (event.type === 'issue') return '⚠️';
    if (event.type === 'acceptance') return '✅';
    if (event.name === 'Thử khuôn') return '🧪';
    if (event.name === 'Gửi mẫu khách') return '📦';
    if (event.name === 'Nhà máy tự sửa') return '🔧';
    if (event.name === 'NCC đã lấy khuôn') return '🚚';
    if (event.name === 'Khuôn nhập kho') return '📥';
    return '📝';
  };
  // Navigation State
  const [activeTab, setActiveTab] = useState<'lookup' | 'config'>('lookup');
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [configSubTab, setConfigSubTab] = useState<'nhan-su' | 'nha-cung-cap' | 'trang-thai-khuon'>('nhan-su');

  const [dbStaff, setDbStaff] = useState<any[]>([]);
  const [dbStatuses, setDbStatuses] = useState<any[]>([]);

  const handleLogoClick = () => {
    setIsDashboardOpen(prev => !prev);
  };

  // Modal Control States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  
  // Fullscreen Lightbox Image url
  const [lightboxImgUrl, setLightboxImgUrl] = useState<string | null>(null);

  // Core Data States
  const [molds, setMolds] = useState<Mold[]>([]);
  const [selectedMoldCode, setSelectedMoldCode] = useState<string | null>(null);
  const [expandedMoldCode, setExpandedMoldCode] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMold, setEditMold] = useState<{ code: string; name: string; supplier: string } | null>(null);
  const [editNewCode, setEditNewCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editSupplier, setEditSupplier] = useState('');

  // Sync edit form fields when editMold is set
  useEffect(() => {
    if (editMold) {
      setEditNewCode(editMold.code);
      setEditName(editMold.name);
      setEditSupplier(editMold.supplier);
    }
  }, [editMold]);
  const [selectedMoldDetail, setSelectedMoldDetail] = useState<MoldDetail | null>(null);
  const [expandedMoldDetail, setExpandedMoldDetail] = useState<MoldDetail | null>(null);
  const [updateMoldDetail, setUpdateMoldDetail] = useState<MoldDetail | null>(null);
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<any | null>(null);
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
  
  // Dynamic fields
  const [errorDesc, setErrorDesc] = useState('');
  const [errorCause, setErrorCause] = useState('');
  const [errorSolution, setErrorSolution] = useState('');
  const [errorImageFile, setErrorImageFile] = useState<File | null>(null);
  const [acceptFeedback, setAcceptFeedback] = useState('');
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
    if (!isCreateModalOpen && !isUpdateModalOpen) return;
    
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
  }, [isCreateModalOpen, isUpdateModalOpen]);

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
  }, []);

  // Reload data based on active tab & dashboard modal
  useEffect(() => {
    if (activeTab === 'lookup') {
      fetchMolds(searchQuery, filterStatus);
    }
  }, [activeTab]);

  // Auto-fetch details when row is expanded to load timeline events
  useEffect(() => {
    if (expandedMoldCode) {
      const fetchExpandedDetail = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/molds/${expandedMoldCode}`);
          if (res.ok) {
            const data = await res.json();
            setExpandedMoldDetail(data);
          }
        } catch (e) {
          console.error("Lỗi khi tải chi tiết dòng mở rộng:", e);
        }
      };
      fetchExpandedDetail();
    } else {
      setExpandedMoldDetail(null);
    }
  }, [expandedMoldCode]);

  useEffect(() => {
    if (isDashboardOpen) {
      fetchStats();
    }
  }, [isDashboardOpen]);

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/staff`);
      if (res.ok) {
        const data = await res.json();
        setDbStaff(data);
      }
    } catch (err) {
      console.error("Lỗi khi tải danh sách nhân sự:", err);
    }
  };

  const fetchStatuses = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/statuses`);
      if (res.ok) {
        const data = await res.json();
        setDbStatuses(data);
      }
    } catch (err) {
      console.error("Lỗi khi tải danh sách trạng thái:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'config') {
      fetchStaff();
      fetchStatuses();
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
    if (!isDashboardOpen) return;

    const timer = setTimeout(() => {
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
    }, 50);

    return () => clearTimeout(timer);
  }, [isDashboardOpen, stats]);

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

  // Chỉnh sửa thông tin chung khuôn
  const handleEditMoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMold) return;
    
    const payload = {
      new_code: editNewCode.trim().toUpperCase(),
      name: editName.trim(),
      supplier: editSupplier.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/molds/${editMold.code}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        alert("Cập nhật thông tin khuôn thành công!");
        setIsEditModalOpen(false);
        setEditMold(null);
        
        // Cập nhật trạng thái hiển thị hiện tại
        if (expandedMoldCode === editMold.code) {
          setExpandedMoldCode(payload.new_code);
        }
        if (selectedMoldCode === editMold.code) {
          setSelectedMoldCode(payload.new_code);
        }
        
        await fetchMolds();
      } else {
        alert(`Lỗi: ${data.detail || "Không thể cập nhật thông tin khuôn."}`);
      }
    } catch {
      alert("Lỗi kết nối mạng khi cập nhật thông tin khuôn.");
    }
  };

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
        setIsCreateModalOpen(false);
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

        res = await fetch(`${API_BASE}/api/molds/${updateMoldCode}/issue`, {
          method: "POST",
          body: formData
        });
      }
      // Trạng thái KHÁCH DUYỆT (NGHIỆM THU)
      else if (updateStatus === 'Khách duyệt (Sản xuất)') {
        const payload = {
          acceptance_feedback: acceptFeedback.trim(),
          technician: updateTechnician
        };
        res = await fetch(`${API_BASE}/api/molds/${updateMoldCode}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
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
        setAcceptFeedback('');
        setGeneralNotes('');
        setSelectedImages([]);
        setSelectedAttachments([]);

        // Đồng bộ, đóng modal và xem chi tiết
        setSelectedMoldCode(updateMoldCode);
        await fetchMolds();
        setIsCreateModalOpen(false);
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

  // Fetch updateMoldDetail when updateMoldCode changes
  useEffect(() => {
    if (updateMoldCode && isUpdateModalOpen) {
      const fetchUpdateDetail = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/molds/${updateMoldCode}`);
          if (res.ok) {
            const data = await res.json();
            setUpdateMoldDetail(data);
          }
        } catch (e) {
          console.error("Lỗi khi tải chi tiết khuôn để cập nhật:", e);
        }
      };
      fetchUpdateDetail();
    } else {
      setUpdateMoldDetail(null);
    }
  }, [updateMoldCode, isUpdateModalOpen]);

  // Kích hoạt Modal ở chế độ Sửa (Edit)
  const triggerQuickUpdate = (code: string) => {
    setUpdateMoldCode(code);
    setUpdateStatus('');
    setIsUpdateModalOpen(true);
  };

  // Kích hoạt Modal ở chế độ Tạo mới (Create)
  const triggerCreateNew = () => {
    setNewCode('');
    setNewName('');
    setNewSupplier('');
    setNewImportDate(new Date().toISOString().split('T')[0]);
    setSelectedImages([]);
    setSelectedAttachments([]);
    setIsCreateModalOpen(true);
  };

  // Computed variables for compatibility with unified database schema (MoldEvent)
  const galleryImages = selectedMoldDetail?.events
    ? selectedMoldDetail.events
        .filter((e: any) => e.images && e.type !== 'acceptance')
        .flatMap((e: any) => e.images.split(',').map((img: string) => ({
          id: e.id,
          file_url: img.trim(),
          file_name: img.split('/').pop() || 'image.jpg',
          is_attachment: false
        })))
    : [];

  const attachmentFiles = selectedMoldDetail?.events
    ? selectedMoldDetail.events
        .filter((e: any) => e.attachments)
        .flatMap((e: any) => {
          try {
            const parsed = JSON.parse(e.attachments);
            return Array.isArray(parsed) ? parsed.map((file: any) => ({
              id: e.id,
              file_url: file.url,
              file_name: file.name,
              is_attachment: true
            })) : [];
          } catch {
            return [];
          }
        })
    : [];

  const errorLogs = selectedMoldDetail?.events
    ? selectedMoldDetail.events
        .filter((e: any) => e.type === 'issue')
        .map((e: any) => {
          const isHtml = e.content && e.content.includes("<strong>");
          if (isHtml) {
            return {
              id: e.id,
              description: e.content,
              cause: "",
              solution: "",
              image_url: e.images,
              created_at: e.created_at
            };
          }
          const lines = e.content ? e.content.split('\n') : [];
          const desc = lines.find((l: string) => l.startsWith("Mô tả sự cố:"))?.replace("Mô tả sự cố:", "").trim() || e.name;
          const cause = lines.find((l: string) => l.startsWith("Nguyên nhân:"))?.replace("Nguyên nhân:", "").trim() || "";
          const solution = lines.find((l: string) => l.startsWith("Giải pháp:"))?.replace("Giải pháp:", "").trim() || "";
          return {
            id: e.id,
            description: desc,
            cause: cause,
            solution: solution,
            image_url: e.images,
            created_at: e.created_at
          };
        })
    : [];



  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <button 
            className="logo-box logo-box-btn"
            onClick={handleLogoClick}
            aria-label="Xem thống kê dashboard"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-icon">
              <path d="M4 6C4 4.89543 7.58172 4 12 4C16.4183 4 20 4.89543 20 6M4 6C4 7.10457 7.58172 8 12 8C16.4183 8 20 7.10457 20 6M4 6V12C4 13.1046 7.58172 14 12 14C16.4183 14 20 13.1046 20 12V6M4 12V18C4 19.1046 7.58172 20 12 20C16.4183 20 20 19.1046 20 18V12M20 12C20 12.1 19.98 12.2 19.95 12.3" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            </svg>
          </button>
          <div className="title-area">
            <h1>MOULD MANAGEMENT <span className="version-badge">v1.1</span></h1>
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
        <button className={`nav-item ${activeTab === 'lookup' ? 'active' : ''}`} onClick={() => setActiveTab('lookup')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="nav-icon"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          Dữ liệu
        </button>
        <button className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => { setActiveTab('config'); fetchDbStatus(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="nav-icon"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          Cấu hình
        </button>
      </nav>

      {/* MAIN PANELS CONTENT */}
      <main className="app-main-content">

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
                        <th>TRẠNG THÁI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {molds.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="form-empty-state">Không tìm thấy khuôn phù hợp.</td>
                        </tr>
                      ) : (
                        molds.map(mold => {
                          let statusClass = "import";
                          if (mold.status === "Thử khuôn") statusClass = "trial";
                          else if (mold.status === "Nhà máy tự sửa") statusClass = "selfrepair";
                          else if (mold.status === "NCC đã lấy khuôn") statusClass = "supplier";
                          else if (mold.status === "Gửi mẫu khách") statusClass = "sample";
                          else if (mold.status === "Khách duyệt (Sản xuất)") statusClass = "accepted";

                          const isExpanded = expandedMoldCode === mold.code;
                          const isSelected = selectedMoldCode === mold.code;

                          return (
                            <React.Fragment key={mold.code}>
                              <tr className={isExpanded || isSelected ? 'selected' : ''} onClick={() => setExpandedMoldCode(isExpanded ? null : mold.code)} style={{ cursor: 'pointer' }}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ 
                                      fontSize: '9px', 
                                      color: 'var(--text-secondary)', 
                                      transition: 'transform 0.2s ease', 
                                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                      display: 'inline-block'
                                    }}>
                                      ▶
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <strong>{mold.code}</strong>
                                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Nhập: {mold.import_date}</span>
                                    </div>
                                  </div>
                                </td>
                                <td>{mold.name}</td>
                                <td>{mold.supplier}</td>
                                <td><span className={`status-pill ${statusClass}`}>{mold.status}</span></td>
                              </tr>
                              
                              {isExpanded && (
                                <tr className="transition-buttons-subrow">
                                  <td colSpan={4} style={{ 
                                    padding: '8px 12px', 
                                    borderBottom: '1px solid var(--border-color)',
                                    backgroundColor: 'transparent'
                                  }}>
                                    <div style={{ 
                                      padding: '16px 20px', 
                                      background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #7c3aed 100%)', 
                                      borderRadius: '12px',
                                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                                      position: 'relative',
                                      overflow: 'hidden',
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      gap: '16px', 
                                      width: '100%'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="info-label" style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '600', letterSpacing: '0.05em' }}>CHUYỂN TRẠNG THÁI NHANH:</span>
                                        <button 
                                          style={{
                                            padding: '5px 14px',
                                            fontSize: '11px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            color: '#fff',
                                            border: '1px solid rgba(255, 255, 255, 0.4)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                            backdropFilter: 'blur(4px)',
                                            WebkitBackdropFilter: 'blur(4px)',
                                            transition: 'all 0.2s ease'
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditMold({ code: mold.code, name: mold.name, supplier: mold.supplier });
                                            setIsEditModalOpen(true);
                                          }}
                                          onMouseOver={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.35)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                                          }}
                                          onMouseOut={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                                          }}
                                        >
                                          Sửa chi tiết
                                        </button>
                                      </div>
                                      
                                      <div className="jira-transition-buttons-grid" style={{ 
                                        display: 'flex', 
                                        flexDirection: 'row',
                                        flexWrap: 'nowrap', 
                                        gap: '12px', 
                                        marginTop: '4px', 
                                        overflowX: 'auto', 
                                        width: '100%', 
                                        WebkitOverflowScrolling: 'touch',
                                        alignItems: 'center',
                                        padding: '4px 0'
                                      }}>
                                        {["Khuôn nhập kho", "Thử khuôn", "Gửi mẫu khách", "Nhà máy tự sửa", "NCC đã lấy khuôn", "Khách duyệt (Sản xuất)"].map(status => {
                                          if (status === mold.status) return null;
                                          const btnClass = 
                                            status === 'Thử khuôn' ? 'trial' :
                                            status === 'Nhà máy tự sửa' ? 'selfrepair' :
                                            status === 'NCC đã lấy khuôn' ? 'supplier' :
                                            status === 'Gửi mẫu khách' ? 'sample' :
                                            status === 'Khách duyệt (Sản xuất)' ? 'accepted' : 'import';
                                          
                                          const getShortStatusName = (name: string) => {
                                            if (name === 'Thử khuôn') return 'Thử\nkhuôn';
                                            if (name === 'Nhà máy tự sửa') return 'Tự\nsửa';
                                            if (name === 'NCC đã lấy khuôn') return 'NCC\nlấy';
                                            if (name === 'Gửi mẫu khách') return 'Gửi\nmẫu';
                                            if (name === 'Khách duyệt (Sản xuất)') return 'Duyệt\nSX';
                                            return 'Nhập\nkho';
                                          };

                                          return (
                                            <div key={status} style={{ flexShrink: 0 }}>
                                              <button 
                                                className={`jira-status-btn ${btnClass}`}
                                                style={{
                                                  width: '50px',
                                                  height: '50px',
                                                  borderRadius: '50%',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  fontSize: '9px',
                                                  fontWeight: '400',
                                                  padding: '4px',
                                                  textAlign: 'center',
                                                  cursor: 'pointer',
                                                  boxSizing: 'border-box',
                                                  lineHeight: '1.1',
                                                  wordBreak: 'break-word',
                                                  whiteSpace: 'pre-wrap'
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation(); // Ngăn chọn lại dòng
                                                  setUpdateMoldCode(mold.code);
                                                  setUpdateStatus(status);
                                                  setIsUpdateModalOpen(true);
                                                }}
                                                title={status}
                                              >
                                                {getShortStatusName(status)}
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Dòng thời gian sự kiện của khuôn tích hợp bên dưới */}
                                      {expandedMoldDetail && expandedMoldDetail.code === mold.code && (
                                        <div className="subrow-timeline-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '16px', marginTop: '4px' }}>
                                          <h4 style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            DÒNG THỜI GIAN TIẾN TRÌNH:
                                          </h4>
                                          <div className="unified-timeline-wrapper-horizontal" style={{ 
                                            position: 'relative', 
                                            margin: '8px 0',
                                            height: '240px',
                                            display: 'flex',
                                            flexDirection: 'row',
                                            overflowX: 'auto',
                                            padding: '0 10px',
                                            alignItems: 'center',
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            WebkitOverflowScrolling: 'touch'
                                          }}>
                                            {!expandedMoldDetail.events || expandedMoldDetail.events.length === 0 ? (
                                              <p style={{ padding: '24px 0', width: '100%', textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px' }}>Chưa có sự kiện nào được ghi nhận.</p>
                                            ) : (() => {
                                              const sortedEvents = [...(expandedMoldDetail.events || [])]
                                                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                              const totalEvents = sortedEvents.length;

                                              return sortedEvents.map((event, i) => {
                                                let nodeColor = '#94a3b8';
                                                if (event.type === 'issue') nodeColor = '#ef4444';
                                                else if (event.type === 'acceptance') nodeColor = '#60a5fa';
                                                else if (event.type === 'transaction') {
                                                  if (event.name === 'Thử khuôn') nodeColor = '#38bdf8';
                                                  else if (event.name === 'Gửi mẫu khách') nodeColor = '#fbbf24';
                                                  else if (event.name === 'Nhà máy tự sửa') nodeColor = '#fb923c';
                                                  else if (event.name === 'NCC đã lấy khuôn') nodeColor = '#c084fc';
                                                  else if (event.name === 'Khách duyệt (Sản xuất)') nodeColor = '#60a5fa';
                                                }

                                                const isEven = i % 2 === 0;

                                                return (
                                                  <div 
                                                    key={event.id} 
                                                    className="timeline-horizontal-column" 
                                                    style={{
                                                      width: '130px',
                                                      height: '100%',
                                                      position: 'relative',
                                                      flexShrink: 0,
                                                      display: 'flex',
                                                      flexDirection: 'column',
                                                      justifyContent: 'center',
                                                      alignItems: 'center',
                                                      cursor: 'pointer'
                                                    }}
                                                    onClick={() => setSelectedTimelineEvent(event)}
                                                  >
                                                    <div className="track-segment" style={{
                                                      position: 'absolute',
                                                      left: '-4px',
                                                      right: '-4px',
                                                      top: '50%',
                                                      transform: 'translateY(-50%)',
                                                      height: '12px',
                                                      backgroundColor: nodeColor,
                                                      zIndex: 1,
                                                      clipPath: getClipPath(i, totalEvents)
                                                    }} />

                                                    <div className="track-dot" style={{
                                                      position: 'absolute',
                                                      width: '6px',
                                                      height: '6px',
                                                      borderRadius: '50%',
                                                      backgroundColor: '#fff',
                                                      top: '50%',
                                                      transform: 'translate(-50%, -50%)',
                                                      left: '50%',
                                                      zIndex: 2
                                                    }} />

                                                    {isEven ? (
                                                      <>
                                                        <div style={{
                                                          position: 'absolute',
                                                          top: '50%',
                                                          left: '50%',
                                                          transform: 'translateX(-50%)',
                                                          height: '35px',
                                                          width: '2px',
                                                          backgroundColor: nodeColor,
                                                          zIndex: 1
                                                        }} />
                                                        <div style={{
                                                          position: 'absolute',
                                                          top: 'calc(50% + 35px)',
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          alignItems: 'center',
                                                          gap: '2px',
                                                          zIndex: 3
                                                        }}>
                                                          <div className="infographic-node-circle" style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '50%',
                                                            backgroundColor: nodeColor,
                                                            border: '2px solid #fff',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: '#fff',
                                                            fontSize: '14px',
                                                            transition: 'all 0.15s ease'
                                                          }}>
                                                            {getEventIcon(event)}
                                                          </div>
                                                          <span className="infographic-node-title" style={{ fontSize: '9px', fontWeight: '600', color: '#fff', textTransform: 'uppercase', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                                            {i === 0 ? "Ngày nhập khuôn" : event.name}
                                                          </span>
                                                          <span style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                                            {i === 0 ? mold.import_date : formatTime(event.created_at).split(' ')[0]}
                                                          </span>
                                                        </div>
                                                      </>
                                                    ) : (
                                                      <>
                                                        <div style={{
                                                          position: 'absolute',
                                                          bottom: '50%',
                                                          left: '50%',
                                                          transform: 'translateX(-50%)',
                                                          height: '35px',
                                                          width: '2px',
                                                          backgroundColor: nodeColor,
                                                          zIndex: 1
                                                        }} />
                                                        <div style={{
                                                          position: 'absolute',
                                                          bottom: 'calc(50% + 35px)',
                                                          display: 'flex',
                                                          flexDirection: 'column-reverse',
                                                          alignItems: 'center',
                                                          gap: '2px',
                                                          zIndex: 3
                                                        }}>
                                                          <div className="infographic-node-circle" style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '50%',
                                                            backgroundColor: nodeColor,
                                                            border: '2px solid #fff',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: '#fff',
                                                            fontSize: '14px',
                                                            transition: 'all 0.15s ease'
                                                          }}>
                                                            {getEventIcon(event)}
                                                          </div>
                                                          <span className="infographic-node-title" style={{ fontSize: '9px', fontWeight: '600', color: '#fff', textTransform: 'uppercase', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                                            {i === 0 ? "Ngày nhập khuôn" : event.name}
                                                          </span>
                                                          <span style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                                            {i === 0 ? mold.import_date : formatTime(event.created_at).split(' ')[0]}
                                                          </span>
                                                        </div>
                                                      </>
                                                    )}
                                                  </div>
                                                );
                                              });
                                            })()}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
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
              <div className={`lookup-right-pane ${selectedMoldDetail ? 'mobile-modal-active' : 'mobile-modal-hidden'}`}>
                {!selectedMoldDetail ? (
                  <div className="detail-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="empty-icon"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    <p>Chọn một khuôn từ danh sách bên trái để xem hồ sơ chi tiết, nhật ký báo lỗi và lịch sử vận hành.</p>
                  </div>
                ) : (
                  <div className="detail-panel-card">
                    <div className="detail-header" style={{ position: 'relative' }}>
                      <button 
                        className="detail-close-btn"
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          zIndex: 10,
                          fontSize: '24px',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          background: 'none',
                          border: 'none',
                          lineHeight: '1',
                          color: 'var(--text-secondary)'
                        }}
                        onClick={() => { setSelectedMoldCode(null); setSelectedMoldDetail(null); }}
                        title="Đóng chi tiết"
                      >
                        &times;
                      </button>
                      <div className="detail-title-block" style={{ width: '100%', paddingRight: '24px' }}>
                        <h2>{selectedMoldDetail.code}</h2>
                        <h3>{selectedMoldDetail.name}</h3>
                        <p className="supplier-info">Nhà cung cấp: {selectedMoldDetail.supplier}</p>
                      </div>
                      <div className="detail-header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', width: '100%', justifyContent: 'flex-end' }}>
                        <button className="btn-badge-action" onClick={() => triggerQuickUpdate(selectedMoldDetail.code)}>
                          Cập nhật &rarr;
                        </button>
                        <button className="btn-danger-action" onClick={() => handleDeleteMold(selectedMoldDetail.code)} title="Xóa khuôn khỏi xưởng">
                          Xóa khuôn
                        </button>
                      </div>
                    </div>

                    {/* DÃY HÌNH THUMBNAIL (GALLERY - KIỂU ADMAKE) */}
                    <div className="properties-gallery-container">
                      <div className="properties-gallery-strip">
                        {/* Hiển thị các hình ảnh của khuôn */}
                        {galleryImages.map(file => (
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
                      <div className="detail-status-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
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
                      {attachmentFiles.length > 0 && (
                        <div className="attachments-list-container">
                          <h4>TÀI LIỆU ĐÍNH KÈM</h4>
                          {attachmentFiles.map(file => (
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
                      {(selectedMoldDetail.status === 'Nhà máy tự sửa' || selectedMoldDetail.status === 'NCC đã lấy khuôn') && errorLogs?.length > 0 && (
                        <div className="detail-section-box error-box">
                          <h4 className="section-title text-red">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="section-title-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            NHẬT KÝ BÁO LỖI
                          </h4>
                          <div className="error-details">
                            <p><strong>Mô tả lỗi:</strong> {errorLogs[errorLogs.length - 1].description}</p>
                            <p><strong>Nguyên nhân:</strong> {errorLogs[errorLogs.length - 1].cause || 'Chưa xác định'}</p>
                            <p><strong>Hướng xử lý:</strong> {errorLogs[errorLogs.length - 1].solution || 'Đang lập kế hoạch sửa đổi'}</p>
                            
                            {errorLogs[errorLogs.length - 1].image_url && (
                              <div className="error-image-wrapper">
                                <p className="img-label">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="img-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                  Hình ảnh chi tiết lỗi:
                                </p>
                                <div className="image-zoom-box" onClick={() => setLightboxImgUrl(`${API_BASE}${errorLogs[errorLogs.length - 1].image_url}`)} style={{ cursor: 'pointer' }}>
                                  <img src={`${API_BASE}${errorLogs[errorLogs.length - 1].image_url}`} alt="Hình ảnh lỗi kỹ thuật" />
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
                            <p dangerouslySetInnerHTML={{ __html: `<strong>Nhận xét:</strong> ${selectedMoldDetail.acceptance_feedback || ''}` }} />
                          </div>
                        </div>
                      )}

                      {/* BẢNG DÒNG THỜI GIAN SỰ KIỆN (TIMELINE CHUNG HÌNH PHỄU / HORIZONTAL CHAIN) */}
                      <div className="detail-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                        <h4 style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '16px', letterSpacing: '0.05em' }}>
                          DÒNG THỜI GIAN SỰ KIỆN ({selectedMoldDetail.events?.length || 0})
                        </h4>
                        
                        <div className="unified-timeline-wrapper-horizontal" style={{ 
                          position: 'relative', 
                          margin: '12px 0',
                          height: '240px',
                          display: 'flex',
                          flexDirection: 'row',
                          overflowX: 'auto',
                          padding: '0 10px',
                          alignItems: 'center',
                          backgroundColor: '#fcfcfd',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          WebkitOverflowScrolling: 'touch'
                        }}>
                          {!selectedMoldDetail.events || selectedMoldDetail.events.length === 0 ? (
                            <p className="form-empty-state" style={{ padding: '24px 0', width: '100%', textAlign: 'center' }}>Chưa có sự kiện nào được ghi nhận.</p>
                          ) : (() => {
                            const sortedEvents = [...(selectedMoldDetail.events || [])]
                              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                            const totalEvents = sortedEvents.length;

                            return sortedEvents.map((event, i) => {
                              // Xác định màu dựa trên event.type / event.name
                              let nodeColor = '#94a3b8'; // Mặc định xám
                              if (event.type === 'issue') nodeColor = '#ef4444'; // Đỏ (sự cố)
                              else if (event.type === 'acceptance') nodeColor = '#10b981'; // Xanh lá (nghiệm thu)
                              else if (event.type === 'transaction') {
                                if (event.name === 'Thử khuôn') nodeColor = '#3b82f6';
                                else if (event.name === 'Gửi mẫu khách') nodeColor = '#f59e0b';
                                else if (event.name === 'Nhà máy tự sửa') nodeColor = '#f97316';
                                else if (event.name === 'NCC đã lấy khuôn') nodeColor = '#8b5cf6';
                              }

                              const isEven = i % 2 === 0;

                              return (
                                <div 
                                  key={event.id} 
                                  className="timeline-horizontal-column" 
                                  style={{
                                    width: '130px',
                                    height: '100%',
                                    position: 'relative',
                                    flexShrink: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => setSelectedTimelineEvent(event)}
                                >
                                  {/* Mắt xích rơ le (chevron segment) */}
                                  <div className="track-segment" style={{
                                    position: 'absolute',
                                    left: '-4px',
                                    right: '-4px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    height: '12px',
                                    backgroundColor: nodeColor,
                                    zIndex: 1,
                                    clipPath: getClipPath(i, totalEvents)
                                  }} />

                                  {/* Dot trắng nằm giữa trục chevron */}
                                  <div className="track-dot" style={{
                                    position: 'absolute',
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: '#fff',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    left: '50%',
                                    zIndex: 2
                                  }} />

                                  {/* Nhánh Connector & Circle nội dung */}
                                  {isEven ? (
                                    <>
                                      {/* Connector Line đi xuống */}
                                      <div style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        height: '35px',
                                        width: '2px',
                                        backgroundColor: nodeColor,
                                        zIndex: 1
                                      }} />
                                      {/* Cụm Circle Node đặt phía dưới */}
                                      <div style={{
                                        position: 'absolute',
                                        top: 'calc(50% + 35px)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '2px',
                                        zIndex: 3
                                      }}>
                                        <div className="infographic-node-circle" style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '50%',
                                          backgroundColor: nodeColor,
                                          border: '2px solid #fff',
                                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: '#fff',
                                          fontSize: '14px',
                                          transition: 'all 0.15s ease'
                                        }}>
                                          {getEventIcon(event)}
                                        </div>
                                        <span className="infographic-node-title" style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                          {i === 0 ? "Ngày nhập khuôn" : event.name}
                                        </span>
                                        <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>
                                          {i === 0 ? selectedMoldDetail.import_date : formatTime(event.created_at).split(' ')[0]}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      {/* Connector Line đi lên */}
                                      <div style={{
                                        position: 'absolute',
                                        bottom: '50%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        height: '35px',
                                        width: '2px',
                                        backgroundColor: nodeColor,
                                        zIndex: 1
                                      }} />
                                      {/* Cụm Circle Node đặt phía trên */}
                                      <div style={{
                                        position: 'absolute',
                                        bottom: 'calc(50% + 35px)',
                                        display: 'flex',
                                        flexDirection: 'column-reverse',
                                        alignItems: 'center',
                                        gap: '2px',
                                        zIndex: 3
                                      }}>
                                        <div className="infographic-node-circle" style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '50%',
                                          backgroundColor: nodeColor,
                                          border: '2px solid #fff',
                                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: '#fff',
                                          fontSize: '14px',
                                          transition: 'all 0.15s ease'
                                        }}>
                                          {getEventIcon(event)}
                                        </div>
                                        <span className="infographic-node-title" style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                          {i === 0 ? "Ngày nhập khuôn" : event.name}
                                        </span>
                                        <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>
                                          {i === 0 ? selectedMoldDetail.import_date : formatTime(event.created_at).split(' ')[0]}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            });
                          })()}
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
            <div className="config-container">
              <div className="config-sub-nav">
                <button 
                  className={`sub-nav-item ${configSubTab === 'nhan-su' ? 'active' : ''}`} 
                  onClick={() => setConfigSubTab('nhan-su')}
                >
                  Nhân sự
                </button>
                <button 
                  className={`sub-nav-item ${configSubTab === 'nha-cung-cap' ? 'active' : ''}`} 
                  onClick={() => setConfigSubTab('nha-cung-cap')}
                >
                  Nhà cung cấp
                </button>
                <button 
                  className={`sub-nav-item ${configSubTab === 'trang-thai-khuon' ? 'active' : ''}`} 
                  onClick={() => setConfigSubTab('trang-thai-khuon')}
                >
                  Trạng thái khuôn
                </button>
              </div>

              <div className="config-sub-content">
                {configSubTab === 'nhan-su' && (
                  <div className="sub-tab-panel">
                    <h3>Quản lý Nhân sự & Phân vai</h3>
                    <p className="sub-tab-desc">Danh sách nhân sự vận hành hệ thống chạy thử và sửa chữa khuôn mẫu.</p>
                    <table className="config-table">
                      <thead>
                        <tr>
                          <th>Họ và Tên</th>
                          <th>Vai trò hệ thống</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbStaff.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="form-empty-state">Đang tải danh sách nhân sự...</td>
                          </tr>
                        ) : (
                          dbStaff.map(s => (
                            <tr key={s.id}>
                              <td><strong>{s.name}</strong></td>
                              <td>{s.role}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {configSubTab === 'nha-cung-cap' && (
                  <div className="sub-tab-panel">
                    <h3>Quản lý Nhà cung cấp (Đối tác chế tạo)</h3>
                    <p className="sub-tab-desc">Các đơn vị cơ khí chính xác chịu trách nhiệm gia công và bảo hành khuôn mẫu.</p>
                    <table className="config-table">
                      <thead>
                        <tr>
                          <th>Mã nhà cung cấp</th>
                          <th>Tên đơn vị chế tạo</th>
                          <th>Người liên hệ chính</th>
                          <th>Tình trạng hợp tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>NCC-MINHDUC</strong></td>
                          <td>Cơ khí khuôn mẫu Minh Đức</td>
                          <td>A. Minh Đức</td>
                          <td><span className="status-pill trial">Đang hoạt động</span></td>
                        </tr>
                        <tr>
                          <td><strong>NCC-ANPHAT</strong></td>
                          <td>Cơ khí chính xác An Phát</td>
                          <td>A. An Phát</td>
                          <td><span className="status-pill trial">Đang hoạt động</span></td>
                        </tr>
                        <tr>
                          <td><strong>NCC-VINA-MOLD</strong></td>
                          <td>Công ty TNHH Vina Mold</td>
                          <td>C. Thanh Thảo</td>
                          <td><span className="status-pill trial">Đang hoạt động</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {configSubTab === 'trang-thai-khuon' && (
                  <div className="sub-tab-panel">
                    <h3>Quy trình & Vòng đời Trạng thái khuôn</h3>
                    <p className="sub-tab-desc">6 trạng thái chính thống nhất trong quy trình chạy thử khuôn và gửi mẫu.</p>
                    <table className="config-table">
                      <thead>
                        <tr>
                          <th>Tên trạng thái</th>
                          <th>Mô tả ý nghĩa quy trình</th>
                          <th>Màu sắc Pill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbStatuses.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="form-empty-state">Đang tải danh sách trạng thái...</td>
                          </tr>
                        ) : (
                          dbStatuses.map(st => (
                            <tr key={st.id}>
                              <td><span className={`status-pill ${st.color}`}>{st.name}</span></td>
                              <td>{st.description || 'Không có mô tả'}</td>
                              <td>{st.color}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ==========================================================================
         SINGLE DATA ENTRY MODAL (Tương tự Admake)
         ========================================================================== */}
      {/* ==========================================================================
         MODAL CHỈNH SỬA THÔNG TIN CHUNG KHUÔN
         ========================================================================== */}
      {isEditModalOpen && editMold && (
        <div className="modal-backdrop" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditModalOpen(false); }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', position: 'relative' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0 }}>Sửa chi tiết khuôn</h2>
              <button 
                className="modal-close-btn" 
                onClick={() => setIsEditModalOpen(false)} 
                title="Đóng cửa sổ"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '18px', height: '18px' }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleEditMoldSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-code">MÃ KHUÔN *</label>
                    <input type="text" id="edit-code" required placeholder="E.G. MK-NAP-24" value={editNewCode} onChange={(e) => setEditNewCode(e.target.value.toUpperCase())} pattern="^[a-zA-Z0-9\-_]+$" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-name">TÊN KHUÔN SẢN XUẤT *</label>
                    <input type="text" id="edit-name" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ width: '100%' }}>
                    <label htmlFor="edit-supplier">ĐƠN VỊ CHẾ TẠO / NHÀ CUNG CẤP *</label>
                    <input type="text" id="edit-supplier" required value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
                  </div>
                </div>

                <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Hủy</button>
                  <button type="submit" className="btn-primary">Lưu Thay Đổi</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
         MODAL 1: KHAI BÁO KHUÔN NHẬP KHO MỚI
         ========================================================================== */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsCreateModalOpen(false); }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', position: 'relative' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0 }}>Khai báo khuôn mới</h2>
              <button 
                className="modal-close-btn" 
                onClick={() => setIsCreateModalOpen(false)} 
                title="Đóng cửa sổ"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '18px', height: '18px' }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
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
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
         MODAL 2: CẬP NHẬT QUY TRÌNH CHẠY THỬ / SỬA KHUÔN
         ========================================================================== */}
      {isUpdateModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsUpdateModalOpen(false); }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', position: 'relative' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0 }}>Cập nhật quy trình</h2>
              <button 
                className="modal-close-btn" 
                onClick={() => setIsUpdateModalOpen(false)} 
                title="Đóng cửa sổ"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '18px', height: '18px' }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {/* Lịch sử dòng thời gian ở đầu modal cập nhật */}
              {updateMoldDetail && (
                <div className="modal-timeline-section" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    DÒNG THỜI GIAN SỰ KIỆN ({updateMoldDetail.events?.length || 0})
                  </h4>
                  
                  <div className="unified-timeline-wrapper-horizontal" style={{ 
                    position: 'relative', 
                    margin: '8px 0',
                    height: '240px',
                    display: 'flex',
                    flexDirection: 'row',
                    overflowX: 'auto',
                    padding: '0 10px',
                    alignItems: 'center',
                    backgroundColor: '#fcfcfd',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    WebkitOverflowScrolling: 'touch'
                  }}>
                    {!updateMoldDetail.events || updateMoldDetail.events.length === 0 ? (
                      <p className="form-empty-state" style={{ padding: '24px 0', width: '100%', textAlign: 'center' }}>Chưa có sự kiện nào được ghi nhận.</p>
                    ) : (() => {
                      const sortedEvents = [...(updateMoldDetail.events || [])]
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                      const totalEvents = sortedEvents.length;

                      return sortedEvents.map((event, i) => {
                        let nodeColor = '#94a3b8'; // Mặc định xám
                        if (event.type === 'issue') nodeColor = '#ef4444'; // Đỏ (sự cố)
                        else if (event.type === 'acceptance') nodeColor = '#10b981'; // Xanh lá (nghiệm thu)
                        else if (event.type === 'transaction') {
                          if (event.name === 'Thử khuôn') nodeColor = '#3b82f6';
                          else if (event.name === 'Gửi mẫu khách') nodeColor = '#f59e0b';
                          else if (event.name === 'Nhà máy tự sửa') nodeColor = '#f97316';
                          else if (event.name === 'NCC đã lấy khuôn') nodeColor = '#8b5cf6';
                        }

                        const isEven = i % 2 === 0;

                        return (
                          <div 
                            key={event.id} 
                            className="timeline-horizontal-column" 
                            style={{
                              width: '130px',
                              height: '100%',
                              position: 'relative',
                              flexShrink: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedTimelineEvent(event)}
                          >
                            <div className="track-segment" style={{
                              position: 'absolute',
                              left: '-4px',
                              right: '-4px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              height: '12px',
                              backgroundColor: nodeColor,
                              zIndex: 1,
                              clipPath: getClipPath(i, totalEvents)
                            }} />

                            <div className="track-dot" style={{
                              position: 'absolute',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: '#fff',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              left: '50%',
                              zIndex: 2
                            }} />

                            {isEven ? (
                              <>
                                <div style={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  height: '35px',
                                  width: '2px',
                                  backgroundColor: nodeColor,
                                  zIndex: 1
                                }} />
                                <div style={{
                                  position: 'absolute',
                                  top: 'calc(50% + 35px)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '2px',
                                  zIndex: 3
                                }}>
                                  <div className="infographic-node-circle" style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: nodeColor,
                                    border: '2px solid #fff',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontSize: '14px',
                                    transition: 'all 0.15s ease'
                                  }}>
                                    {getEventIcon(event)}
                                  </div>
                                  <span className="infographic-node-title" style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                    {i === 0 ? "Ngày nhập khuôn" : event.name}
                                  </span>
                                  <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>
                                    {i === 0 ? updateMoldDetail.import_date : formatTime(event.created_at).split(' ')[0]}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{
                                  position: 'absolute',
                                  bottom: '50%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  height: '35px',
                                  width: '2px',
                                  backgroundColor: nodeColor,
                                  zIndex: 1
                                }} />
                                <div style={{
                                  position: 'absolute',
                                  bottom: 'calc(50% + 35px)',
                                  display: 'flex',
                                  flexDirection: 'column-reverse',
                                  alignItems: 'center',
                                  gap: '2px',
                                  zIndex: 3
                                }}>
                                  <div className="infographic-node-circle" style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: nodeColor,
                                    border: '2px solid #fff',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontSize: '14px',
                                    transition: 'all 0.15s ease'
                                  }}>
                                    {getEventIcon(event)}
                                  </div>
                                  <span className="infographic-node-title" style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                    {i === 0 ? "Ngày nhập khuôn" : event.name}
                                  </span>
                                  <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>
                                    {i === 0 ? updateMoldDetail.import_date : formatTime(event.created_at).split(' ')[0]}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
              <form onSubmit={handleUpdateStatus}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="update-select-mold">KHUÔN CẦN CẬP NHẬT *</label>
                    {updateMoldCode ? (
                      <div style={{ padding: '10px 14px', backgroundColor: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {updateMoldCode} - {molds.find(m => m.code === updateMoldCode)?.name || ''}
                      </div>
                    ) : (
                      <select id="update-select-mold" required value={updateMoldCode} onChange={(e) => setUpdateMoldCode(e.target.value)}>
                        <option value="" disabled>-- Click chọn mã khuôn đang quản lý --</option>
                        {molds.map(m => (
                          <option key={m.code} value={m.code}>{m.code} - {m.name}</option>
                        ))}
                      </select>
                    )}
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
                  {updateStatus ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className={`status-badge-styled ${
                        updateStatus === 'Thử khuôn' ? 'trial' :
                        updateStatus === 'Nhà máy tự sửa' ? 'selfrepair' :
                        updateStatus === 'NCC đã lấy khuôn' ? 'supplier' :
                        updateStatus === 'Gửi mẫu khách' ? 'sample' :
                        updateStatus === 'Khách duyệt (Sản xuất)' ? 'accepted' : 'import'
                      }`} style={{ fontSize: '13px', padding: '6px 16px', borderRadius: '4px', fontWeight: '600' }}>
                        {updateStatus}
                      </span>
                    </div>
                  ) : (
                    <select id="update-status" required value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value)}>
                      <option value="" disabled>-- Chọn trạng thái cập nhật tiếp theo --</option>
                      <option value="Thử khuôn">Thử khuôn (Chạy thử mẫu)</option>
                      <option value="Gửi mẫu khách">Gửi mẫu khách (Khách duyệt mẫu)</option>
                      <option value="Nhà máy tự sửa">Nhà máy tự sửa (Phát hiện lỗi & tự khắc phục)</option>
                      <option value="NCC đã lấy khuôn">NCC đã lấy khuôn (Chuyển trả đơn vị chế tạo sửa)</option>
                      <option value="Khách duyệt (Sản xuất)">Khách duyệt (Sản xuất) (Ký duyệt nghiệm thu)</option>
                    </select>
                  )}
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
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
         LIGHTBOX OVERLAY (Xem ảnh full-size phóng to)
         ========================================================================== */}
      {lightboxImgUrl && (
        <div className="lightbox-backdrop" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLightboxImgUrl(null); }}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxImgUrl(null)}>
              &times;
            </button>
            <img src={lightboxImgUrl} alt="Phóng to ảnh mẫu" />
          </div>
        </div>
      )}

      {/* ==========================================================================
         DASHBOARD STATISTICS MODAL (Hover/Click trigger)
         ========================================================================== */}
      {isDashboardOpen && (
        <div 
          className="dashboard-modal-backdrop" 
          onClick={() => setIsDashboardOpen(false)}
        >
          <div 
            className="dashboard-modal-container" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '20px', height: '20px', color: 'var(--primary-color)' }}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
                <h2>DASHBOARD THỐNG KÊ CHI TIẾT</h2>
              </div>
              <button 
                className="dashboard-modal-close" 
                onClick={() => setIsDashboardOpen(false)}
                title="Đóng dashboard"
              >
                &times;
              </button>
            </div>
            
            <div className="dashboard-modal-body">
              {/* Stats Cards */}
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

              {/* Charts */}
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
            </div>
          </div>
        </div>
      )}
      {/* EVENT ROLL PAGE (DRAWER / SLIDE-IN PEAK VIEW) */}
      {selectedTimelineEvent && (
        <div className="roll-page-overlay" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedTimelineEvent(null); }} style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          
          <div className="roll-page-drawer" style={{
            width: '400px',
            maxWidth: '100%',
            height: '100%',
            backgroundColor: 'var(--bg-card)',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            boxSizing: 'border-box'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Drawer Header */}
            <div className="roll-page-header" style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fafafa'
            }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  CHI TIẾT SỰ KIỆN / EVENT
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                  {selectedTimelineEvent.name}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedTimelineEvent(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '28px',
                  lineHeight: '1',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '4px 8px',
                  borderRadius: '4px'
                }}
              >
                &times;
              </button>
            </div>
            
            {/* Drawer Content */}
            <div className="roll-page-content" style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {/* Thẻ Thời gian & Người thực hiện */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Thời gian tạo:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatTime(selectedTimelineEvent.created_at)}</strong>
                </div>
                {selectedTimelineEvent.tagged_staff && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Người thực hiện:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{selectedTimelineEvent.tagged_staff}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Loại sự kiện:</span>
                  <span className={`status-pill ${selectedTimelineEvent.type}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                    {selectedTimelineEvent.type === 'issue' ? 'SỰ CỐ' :
                     selectedTimelineEvent.type === 'acceptance' ? 'NGHIỆM THU' :
                     selectedTimelineEvent.type === 'file_upload' ? 'FILE ĐÍNH KÈM' : 'QUY TRÌNH'}
                  </span>
                </div>
              </div>

              {/* Nội dung chi tiết / Comment */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>NỘI DUNG / BÌNH LUẬN:</span>
                <div 
                  className="timeline-html-content"
                  style={{
                    fontSize: '13px',
                    lineHeight: '1.6',
                    color: 'var(--text-primary)',
                    backgroundColor: '#fff',
                    border: '1px solid var(--border-color)',
                    padding: '16px',
                    borderRadius: '8px',
                    minHeight: '80px',
                    whiteSpace: 'pre-wrap'
                  }}
                  dangerouslySetInnerHTML={{ __html: selectedTimelineEvent.content || 'Không có ghi chú thêm.' }}
                />
              </div>

              {/* Hình ảnh đính kèm */}
              {selectedTimelineEvent.images && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>HÌNH ẢNH THỰC TẾ:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedTimelineEvent.images.split(',').map((img: string, idx: number) => (
                      <div 
                        key={idx} 
                        className="image-zoom-box" 
                        onClick={() => setLightboxImgUrl(`${API_BASE}${img.trim()}`)} 
                        style={{ 
                          cursor: 'pointer',
                          width: '100px',
                          height: '100px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <img 
                          src={`${API_BASE}${img.trim()}`} 
                          alt="Ảnh đính kèm sự kiện" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* File đính kèm tài liệu */}
              {selectedTimelineEvent.attachments && (() => {
                try {
                  const docs = JSON.parse(selectedTimelineEvent.attachments);
                  if (Array.isArray(docs) && docs.length > 0) {
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>TÀI LIỆU ĐÍNH KÈM:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {docs.map((doc: any, idx: number) => (
                            <a 
                              key={idx} 
                              href={`${API_BASE}${doc.url}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 12px',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                color: '#0052cc',
                                fontSize: '12px',
                                backgroundColor: '#f8fafc',
                                transition: 'all 0.15s ease'
                              }}
                              className="attachment-download-badge"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Tải về</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  }
                } catch {}
                return null;
              })()}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
