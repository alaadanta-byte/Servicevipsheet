import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { sheetsAPI } from '../services/api';
import {
    DEFAULT_SHEETS,
    STORAGE_PREFIX,
    sanitizeRecord,
    scanAndRepairAllSheets,
    buildRealisticSampleData,
    resetAllSheets,
    calculateAccountReminder
} from '../utils/dataRepair';

// Calendar Icon with dynamic number or placeholder matching the user design
const CalendarOptionIcon = ({ num = null, isSelected = false }) => {
    const strokeColor = isSelected ? '#2563eb' : '#64748b';
    return (
        <svg
            className="w-5 h-5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="4" width="18" height="18" rx="3" ry="3" fill={isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent'} />
            <line x1="16" y1="2" x2="16" y2="6" stroke={strokeColor} strokeWidth="2" />
            <line x1="8" y1="2" x2="8" y2="6" stroke={strokeColor} strokeWidth="2" />
            <line x1="3" y1="10" x2="21" y2="10" stroke={strokeColor} strokeWidth="1.5" />
            {num ? (
                <text
                    x="12"
                    y="18.5"
                    textAnchor="middle"
                    fill={strokeColor}
                    stroke="none"
                    fontSize="9"
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, sans-serif"
                >
                    {num}
                </text>
            ) : (
                <g stroke={strokeColor} strokeWidth="2">
                    <line x1="7.5" y1="15.5" x2="10" y2="15.5" />
                    <line x1="14" y1="15.5" x2="16.5" y2="15.5" />
                </g>
            )}
        </svg>
    );
};

const DURATION_ITEMS = [
    { label: '1 شهر', value: '1 شهر', num: 1 },
    { label: '2 شهر', value: '2 شهر', num: 2 },
    { label: '3 شهور', value: '3 شهور', num: 3 },
    { label: '4 شهور', value: '4 شهور', num: 4 },
    { label: '5 شهور', value: '5 شهور', num: 5 },
    { label: '6 شهور', value: '6 شهور', num: 6 },
];

export const SERVICE_TYPE_OPTIONS = [
    {
        label: 'Private',
        value: 'Private',
        icon: 'fa-solid fa-lock',
        desc: 'حساب خاص بريميوم',
        badge: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/60',
        iconColor: 'text-purple-500'
    },
    {
        label: 'Service VIP',
        value: 'Service VIP',
        icon: 'fa-solid fa-crown',
        desc: 'سيرفر وخدمة Service VIP',
        badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60',
        iconColor: 'text-amber-500'
    },
    {
        label: 'Z Y N O R A',
        value: 'Z Y N O R A',
        icon: 'fa-solid fa-bolt',
        desc: 'سيرفر وخدمة ZYNORA',
        badge: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60',
        iconColor: 'text-blue-500'
    }
];


/**
 * Calculates accurate remaining subscription duration from start date and duration string
 */
export const calculateRemainingTime = (rawStartDate, rawDuration, rawCreatedAt) => {
    const duration = String(rawDuration || '').trim();
    if (!duration) {
        return { text: '-', status: 'none', days: null };
    }

    if (duration.includes('مدى الحياة') || duration.toLowerCase().includes('lifetime')) {
        return { text: 'مدى الحياة', status: 'lifetime', days: 999999, label: '∞' };
    }

    const effectiveDateStr = rawStartDate || (rawCreatedAt ? String(rawCreatedAt).slice(0, 10) : '');
    if (!effectiveDateStr) {
        return { text: '-', status: 'none', days: null };
    }

    const parseDateParts = (str) => {
        if (!str) return null;
        if (str instanceof Date && !isNaN(str.getTime())) return new Date(str.getFullYear(), str.getMonth(), str.getDate());
        const s = String(str).trim().slice(0, 10);
        const match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (match) {
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };

    const start = parseDateParts(effectiveDateStr);
    if (!start) {
        return { text: '-', status: 'none', days: null };
    }

    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    if (duration.includes('سنة') || duration.includes('سنوات') || duration.toLowerCase().includes('year')) {
        const num = parseInt(duration) || 1;
        end.setFullYear(end.getFullYear() + num);
    } else if (duration.includes('شهر') || duration.includes('شهور') || duration.toLowerCase().includes('month')) {
        const num = parseInt(duration) || 1;
        end.setMonth(end.getMonth() + num);
    } else if (duration.includes('يوم') || duration.toLowerCase().includes('day')) {
        const num = parseInt(duration) || 30;
        end.setDate(end.getDate() + num);
    } else {
        const num = parseInt(duration);
        if (!isNaN(num) && num > 0) {
            end.setMonth(end.getMonth() + num);
        } else {
            return { text: '-', status: 'none', days: null };
        }
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffMs = end.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const y = end.getFullYear();
    const m = String(end.getMonth() + 1).padStart(2, '0');
    const d = String(end.getDate()).padStart(2, '0');
    const endFormatted = `${y}-${m}-${d}`;

    const startFormatted = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    if (diffDays < 0) {
        const absDays = Math.abs(diffDays);
        return {
            text: absDays === 1 ? 'منتهي أمس' : `منتهي (منذ ${absDays} يوم)`,
            status: 'expired',
            days: diffDays,
            endDate: endFormatted,
            startDate: startFormatted
        };
    }

    if (diffDays === 0) {
        return {
            text: 'ينتهي اليوم',
            status: 'expiring-today',
            days: 0,
            endDate: endFormatted,
            startDate: startFormatted
        };
    }

    if (diffDays === 1) {
        return {
            text: 'متبقي يوم واحد',
            status: 'urgent',
            days: 1,
            endDate: endFormatted,
            startDate: startFormatted
        };
    }

    if (diffDays < 30) {
        return {
            text: `متبقي ${diffDays} يوم`,
            status: diffDays <= 3 ? 'urgent' : (diffDays <= 7 ? 'warning' : 'active'),
            days: diffDays,
            endDate: endFormatted,
            startDate: startFormatted
        };
    }

    const months = Math.floor(diffDays / 30);
    const remDays = diffDays % 30;

    let text = '';
    if (months === 1) {
        text = remDays > 0 ? `متبقي شهر و ${remDays} يوم` : 'متبقي شهر';
    } else if (months === 2) {
        text = remDays > 0 ? `متبقي شهرين و ${remDays} يوم` : 'متبقي شهرين';
    } else if (months >= 3 && months <= 10) {
        text = remDays > 0 ? `متبقي ${months} شهور و ${remDays} يوم` : `متبقي ${months} شهور`;
    } else {
        text = remDays > 0 ? `متبقي ${months} شهر و ${remDays} يوم` : `متبقي ${months} شهر`;
    }

    return {
        text,
        status: 'active',
        days: diffDays,
        endDate: endFormatted,
        startDate: startFormatted
    };
};

export default function CustomSheets({ activeSheetId, setActiveSheetId }) {
    const { user, hasPermission } = useAuth();
    const { showConfirm, showAlert } = useConfirm();
    const canAdd = user?.role === 'admin' || hasPermission('add_row');
    const canEdit = user?.role === 'admin' || hasPermission('edit_row');
    const canDelete = user?.role === 'admin' || hasPermission('delete_row');
    const canEmptyTrash = user?.role === 'admin' || hasPermission('empty_trash');
    const canCustomize = user?.role === 'admin' || hasPermission('customize_columns');

    // Current active sheet
    const currentSheetId = activeSheetId || 'client_data';
    const isTrashSheet = currentSheetId === 'trash_data';

    // Sheet titles & metadata (customizable)
    const [sheetsList, setSheetsList] = useState(() => {
        try {
            const saved = localStorage.getItem('sv_sheets_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    let updated = [...parsed];
                    const hasInvoice = updated.some(s => s.id === 'invoice_data');
                    if (hasInvoice) {
                        updated = updated.map(s => s.id === 'invoice_data' ? {
                            id: 'trash_data',
                            name: 'سلة المهملات',
                            icon: 'fa-trash-can',
                            color: 'from-rose-600 to-red-600',
                            badgeColor: 'bg-rose-500'
                        } : s);
                    }
                    if (!updated.some(s => s.id === 'customers_data')) {
                        const trashIdx = updated.findIndex(s => s.id === 'trash_data');
                        const newSheet = { id: 'customers_data', name: 'داتا العملاء', icon: 'fa-address-book', color: 'from-cyan-600 to-blue-600', badgeColor: 'bg-cyan-500' };
                        if (trashIdx !== -1) {
                            updated.splice(trashIdx, 0, newSheet);
                        } else {
                            updated.push(newSheet);
                        }
                    }
                    localStorage.setItem('sv_sheets_config', JSON.stringify(updated));
                    return updated;
                }
            }
            return DEFAULT_SHEETS;
        } catch {
            return DEFAULT_SHEETS;
        }
    });

    // Sheet Data state for current sheet
    const [records, setRecords] = useState([]);
    const [allSheetsCounts, setAllSheetsCounts] = useState({});

    // UI States
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showRepairModal, setShowRepairModal] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [editingRecord, setEditingRecord] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [visibleSecrets, setVisibleSecrets] = useState({}); // { [rowId_field]: boolean }
    const [copiedField, setCopiedField] = useState(null);
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortBy, setSortBy] = useState({ field: 'created_at', asc: false });
    const [bulkText, setBulkText] = useState('');
    const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
    const durationDropdownRef = useRef(null);
    const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
    const serviceDropdownRef = useRef(null);
    const [expiryFilter, setExpiryFilter] = useState('all'); // 'all', 'near', 'expired', 'active'
    const [isAlertsExpanded, setIsAlertsExpanded] = useState(true);
    const [saleMenuAnchor, setSaleMenuAnchor] = useState(null); // { id, top, left, saleStatus, isSold }

    // Notification toast
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // File input ref for import
    const fileInputRef = useRef(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        password: '',
        password2: '',
        serviceType: '',
        duration: '',
        startDate: '',
        deviceType: 'جهاز',
        paymentStatus: 'مدفوع',
        selectedAccount: '',
        invoiceNumber: '',
        visa: '',
        visaAccount: '',
        notes: '',
        accountCreatedDate: '',
        reminderDays: '',
        saleStatus: ''
    });

    // Stored accounts loaded from account_data for dropdown selection
    const [availableAccounts, setAvailableAccounts] = useState([]);

    const refreshAvailableAccounts = () => {
        try {
            const key = `${STORAGE_PREFIX}account_data`;
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const sanitized = parsed.map((a, i) => sanitizeRecord(a, i)).filter(Boolean);
                    setAvailableAccounts(sanitized);
                    return;
                }
            }
        } catch (e) {
            console.error('Error loading available accounts:', e);
        }
        setAvailableAccounts([]);
    };

    // Load records whenever currentSheetId changes with automatic row sanitization
    const loadCurrentSheetData = async () => {
        try {
            refreshAvailableAccounts();
            const key = `${STORAGE_PREFIX}${currentSheetId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    const sanitized = parsed.map((item, idx) => sanitizeRecord(item, idx)).filter(Boolean);
                    setRecords(sanitized);
                }
            }

            // Sync with Supabase cloud
            const cloudRecords = await sheetsAPI.getSheetRecords(currentSheetId);
            if (cloudRecords && Array.isArray(cloudRecords)) {
                const sanitized = cloudRecords.map((item, idx) => sanitizeRecord(item, idx)).filter(Boolean);
                setRecords(sanitized);
                refreshAllCounts();
            }
        } catch (e) {
            console.error('Failed to load sheet data:', e);
        }
    };

    // Update counts of all sheets for badges
    const refreshAllCounts = () => {
        const counts = {};
        sheetsList.forEach(s => {
            try {
                const data = localStorage.getItem(`${STORAGE_PREFIX}${s.id}`);
                if (data) {
                    const parsed = JSON.parse(data);
                    counts[s.id] = Array.isArray(parsed) ? parsed.length : 0;
                } else {
                    counts[s.id] = 0;
                }
            } catch {
                counts[s.id] = 0;
            }
        });
        setAllSheetsCounts(counts);
    };

    // Self-healing check on component mount
    useEffect(() => {
        try {
            const report = scanAndRepairAllSheets(sheetsList);
            if (report.hasCorruptData) {
                showToast(`تم اكتشاف وإصلاح ${report.totalRecordsRepaired} سجل تالف تلقائياً بنجاح ✓`, 'info');
            }
        } catch (err) {
            console.warn('Auto-repair scan warning:', err);
        }
        sheetsAPI.getSheetsConfig().then(cfg => {
            if (Array.isArray(cfg) && cfg.length > 0) {
                setSheetsList(cfg);
            }
        });
    }, []);

    // Periodic background sync across devices (every 3 seconds)
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const cloudRecords = await sheetsAPI.getSheetRecords(currentSheetId);
                if (cloudRecords && Array.isArray(cloudRecords)) {
                    const sanitized = cloudRecords.map((item, idx) => sanitizeRecord(item, idx)).filter(Boolean);
                    setRecords(prev => {
                        if (JSON.stringify(prev) !== JSON.stringify(sanitized)) {
                            return sanitized;
                        }
                        return prev;
                    });
                    refreshAllCounts();
                }
            } catch {}
        }, 3000);
        return () => clearInterval(interval);
    }, [currentSheetId]);

    // Close duration & service dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (durationDropdownRef.current && !durationDropdownRef.current.contains(e.target)) {
                setIsDurationDropdownOpen(false);
            }
            if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(e.target)) {
                setIsServiceDropdownOpen(false);
            }
        };
        if (isDurationDropdownOpen || isServiceDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDurationDropdownOpen, isServiceDropdownOpen]);

    // Close floating sale menu on scroll or resize
    useEffect(() => {
        if (!saleMenuAnchor) return;
        const handleDismiss = () => setSaleMenuAnchor(null);
        window.addEventListener('scroll', handleDismiss, true);
        window.addEventListener('resize', handleDismiss);
        return () => {
            window.removeEventListener('scroll', handleDismiss, true);
            window.removeEventListener('resize', handleDismiss);
        };
    }, [saleMenuAnchor]);

    useEffect(() => {
        loadCurrentSheetData();
        refreshAllCounts();
        setSelectedIds(new Set());
        setCurrentPage(1);
        setSearchTerm('');
        setExpiryFilter('all');
    }, [currentSheetId]);

    // Save records to LocalStorage & Supabase cloud
    const saveRecords = (newRecords) => {
        try {
            const sanitized = newRecords.map((r, i) => sanitizeRecord(r, i)).filter(Boolean);
            setRecords(sanitized);
            sheetsAPI.saveSheetRecords(currentSheetId, sanitized);
            refreshAllCounts();
            if (currentSheetId === 'account_data') {
                refreshAvailableAccounts();
            }
        } catch (e) {
            console.error('Error saving data:', e);
            showToast('حدث خطأ أثناء حفظ البيانات', 'error');
        }
    };

    // Data Repair Modal Handlers
    const handleScanAndRepair = () => {
        const report = scanAndRepairAllSheets(sheetsList);
        loadCurrentSheetData();
        refreshAllCounts();
        if (report.hasCorruptData) {
            showToast(`تم فحص جميع الشيتات وإصلاح ${report.totalRecordsRepaired} سجل بنجاح ✓`, 'success');
        } else {
            showToast('تم فحص جميع الشيتات: جميع البيانات سليمة بنسبة 100% ولا توجد أخطاء ✓', 'success');
        }
    };

    const handleBuildSampleData = () => {
        const totalAdded = buildRealisticSampleData(true);
        loadCurrentSheetData();
        refreshAllCounts();
        showToast(`تم بنجاح بناء وتوليد ${totalAdded} سجل نموذجي واقعي لجميع الشيتات الأربعة ✓`, 'success');
        setShowRepairModal(false);
    };

    const handleResetClean = async () => {
        const confirmed = await showConfirm({
            title: 'إعادة تهيئة الشيتات',
            message: 'تحذير: هل أنت متأكد من رغبتك في تفريغ جميع السجلات والبدء بشيتات نظيفة تماماً؟',
            confirmText: 'نعم، تفريغ الشيتات',
            cancelText: 'إلغاء',
            type: 'danger'
        });
        if (!confirmed) return;

        resetAllSheets(sheetsList);
        loadCurrentSheetData();
        refreshAllCounts();
        showToast('تمت إعادة تهيئة الشيتات بنجاح', 'info');
        setShowRepairModal(false);
    };

    // Current sheet object
    const currentSheet = useMemo(() => {
        return sheetsList.find(s => s.id === currentSheetId) || sheetsList[0] || DEFAULT_SHEETS[0];
    }, [sheetsList, currentSheetId]);

    const isClientOrMerchant = currentSheetId === 'client_data' || currentSheetId === 'merchant_data';
    const isCustomersSheet = currentSheetId === 'customers_data';

    // Copy helper with feedback
    const handleCopy = (text, key) => {
        if (!text) {
            showToast('لا توجد بيانات للنسخ', 'warning');
            return;
        }
        navigator.clipboard.writeText(text);
        setCopiedField(key);
        showToast('تم النسخ إلى الحافظة بنجاح ✓', 'success');
        setTimeout(() => setCopiedField(null), 1500);
    };

    // Toggle Secret Visibility
    const toggleSecret = (id, field) => {
        const key = `${id}_${field}`;
        setVisibleSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Handle Form Submit (Add or Edit)
    const handleFormSubmit = (e) => {
        e.preventDefault();

        if (currentSheetId === 'customers_data') {
            if (!formData.name && !formData.phone) {
                showToast('يرجى إدخال اسم العميل أو رقم التليفون على الأقل', 'warning');
                return;
            }
        } else if (isClientOrMerchant) {
            if (!formData.email && !formData.password && !formData.password2 && !formData.duration && !formData.selectedAccount) {
                showToast('يرجى إدخال البريد الإلكتروني أو كلمة المرور أو مدة الاشتراك أو بيانات الحساب على الأقل', 'warning');
                return;
            }
        } else if (currentSheetId === 'account_data') {
            if (!formData.email && !formData.password && !formData.password2) {
                showToast('يرجى إدخال البريد الإلكتروني أو كلمة المرور على الأقل', 'warning');
                return;
            }
        } else {
            if (!formData.email && !formData.invoiceNumber && !formData.visa && !formData.selectedAccount) {
                showToast('يرجى إدخال البريد الإلكتروني أو رقم الفاتورة أو بيانات الحساب على الأقل', 'warning');
                return;
            }
        }

        const cleanPayload = currentSheetId === 'customers_data' ? {
            name: formData.name || '',
            phone: formData.phone || '',
            deviceType: formData.deviceType || '',
            notes: formData.notes || '',
            email: formData.email || '',
            password: '',
            password2: '',
            serviceType: '',
            duration: '',
            startDate: '',
            paymentStatus: '',
            selectedAccount: '',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            accountCreatedDate: '',
            reminderDays: '',
            saleStatus: null,
            isSold: null
        } : isClientOrMerchant ? {
            name: formData.name || '',
            phone: formData.phone || '',
            email: formData.email,
            password: formData.password,
            password2: formData.password2,
            serviceType: formData.serviceType || '',
            duration: formData.duration,
            startDate: formData.startDate || '',
            deviceType: formData.deviceType || 'جهاز',
            paymentStatus: formData.paymentStatus || 'مدفوع',
            selectedAccount: formData.selectedAccount || '',
            notes: formData.notes,
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            accountCreatedDate: '',
            reminderDays: '',
            saleStatus: null,
            isSold: null
        } : currentSheetId === 'account_data' ? {
            name: '',
            phone: '',
            email: formData.email,
            password: formData.password,
            password2: formData.password2,
            serviceType: '',
            invoiceNumber: formData.invoiceNumber || '',
            visa: formData.visa || '',
            visaAccount: formData.visaAccount || '',
            duration: '',
            startDate: '',
            deviceType: '',
            paymentStatus: '',
            selectedAccount: '',
            notes: formData.notes,
            accountCreatedDate: formData.accountCreatedDate || new Date().toISOString().slice(0, 10),
            reminderDays: formData.reminderDays || '',
            saleStatus: formData.saleStatus || (editingRecord?.saleStatus || null),
            isSold: formData.saleStatus === 'sold' ? true : formData.saleStatus === 'unsold' ? false : (editingRecord?.isSold ?? null)
        } : {
            name: '',
            phone: '',
            email: formData.email,
            password: formData.password,
            password2: formData.password2,
            serviceType: '',
            invoiceNumber: formData.invoiceNumber,
            visa: formData.visa,
            visaAccount: formData.visaAccount,
            duration: '',
            startDate: '',
            deviceType: '',
            paymentStatus: '',
            selectedAccount: formData.selectedAccount || '',
            notes: formData.notes,
            accountCreatedDate: '',
            reminderDays: '',
            saleStatus: null,
            isSold: null
        };

        if (editingRecord) {
            // Edit existing
            const updated = records.map(item => {
                if (item.id === editingRecord.id) {
                    return {
                        ...item,
                        ...cleanPayload,
                        updated_at: new Date().toISOString()
                    };
                }
                return item;
            });
            saveRecords(updated);
            showToast('تم تعديل البيانات بنجاح ✓', 'success');
        } else {
            // Add new
            const newRecord = {
                id: 'REC-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                ...cleanPayload,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            saveRecords([newRecord, ...records]);
            showToast('تم إضافة السجل الجديد بنجاح ✓', 'success');
        }

        setShowAddModal(false);
        setEditingRecord(null);
        setFormData({
            name: '',
            phone: '',
            email: '',
            password: '',
            password2: '',
            serviceType: '',
            duration: '',
            startDate: '',
            deviceType: currentSheetId === 'customers_data' ? '' : 'جهاز',
            paymentStatus: 'مدفوع',
            selectedAccount: '',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: '',
            accountCreatedDate: '',
            reminderDays: '',
            saleStatus: ''
        });
    };

    // Open Edit Modal
    const handleOpenEdit = (rec) => {
        refreshAvailableAccounts();
        setEditingRecord(rec);
        setFormData({
            name: rec.name || '',
            phone: rec.phone || '',
            email: rec.email || '',
            password: rec.password || '',
            password2: rec.password2 || '',
            serviceType: rec.serviceType || '',
            duration: rec.duration || '',
            startDate: rec.startDate || rec.date || '',
            deviceType: rec.deviceType || 'جهاز',
            paymentStatus: rec.paymentStatus || 'مدفوع',
            selectedAccount: rec.selectedAccount || '',
            invoiceNumber: rec.invoiceNumber || '',
            visa: rec.visa || '',
            visaAccount: rec.visaAccount || '',
            notes: rec.notes || '',
            accountCreatedDate: rec.accountCreatedDate || '',
            reminderDays: rec.reminderDays || '',
            saleStatus: rec.saleStatus || (rec.isSold === true ? 'sold' : rec.isSold === false ? 'unsold' : '')
        });
        setShowAddModal(true);
    };

    // Move records to trash
    const moveToTrash = (recordsToTrash, originId, originName) => {
        try {
            const trashKey = `${STORAGE_PREFIX}trash_data`;
            const existingTrashRaw = localStorage.getItem(trashKey);
            let existingTrash = [];
            if (existingTrashRaw) {
                try {
                    const parsed = JSON.parse(existingTrashRaw);
                    if (Array.isArray(parsed)) existingTrash = parsed;
                } catch {}
            }

            const now = new Date().toISOString();
            const prepared = recordsToTrash.map(rec => ({
                ...rec,
                deletedAt: now,
                originSheetId: originId,
                originSheetName: originName
            }));

            const updatedTrash = [...prepared, ...existingTrash].map((r, i) => sanitizeRecord(r, i)).filter(Boolean);
            sheetsAPI.saveSheetRecords('trash_data', updatedTrash);
            refreshAllCounts();
        } catch (err) {
            console.error('Error moving records to trash:', err);
        }
    };

    // Delete single record (Soft delete to trash, or permanent if already in trash)
    const handleDeleteRecord = async (id) => {
        if (isTrashSheet) {
            const confirmed = await showConfirm({
                title: 'حذف السجل نهائياً',
                message: 'هل أنت متأكد من حذف هذا السجل نهائياً؟ لن يمكنك استعادته مرة أخرى.',
                confirmText: 'نعم، احذف',
                cancelText: 'إلغاء',
                type: 'danger'
            });
            if (!confirmed) return;

            const updated = records.filter(r => r.id !== id);
            saveRecords(updated);
            const newSelected = new Set(selectedIds);
            newSelected.delete(id);
            setSelectedIds(newSelected);
            showToast('تم الحذف النهائي للسجل بنجاح', 'info');
        } else {
            const confirmed = await showConfirm({
                title: 'حذف السجل',
                message: 'هل تريد حذف هذا السجل ونقله إلى سلة المهملات؟',
                confirmText: 'نعم، احذف',
                cancelText: 'إلغاء',
                type: 'danger'
            });
            if (!confirmed) return;

            const targetRecord = records.find(r => r.id === id);
            if (targetRecord) {
                moveToTrash([targetRecord], currentSheetId, currentSheet?.name || 'شيت');
            }
            const updated = records.filter(r => r.id !== id);
            saveRecords(updated);
            const newSelected = new Set(selectedIds);
            newSelected.delete(id);
            setSelectedIds(newSelected);
            showToast('تم نقل السجل إلى سلة المهملات بنجاح ✓', 'success');
        }
    };

    // Restore single record from trash back to its original sheet
    const handleRestoreRecord = (recordToRestore) => {
        try {
            const targetSheetId = recordToRestore.originSheetId || 'account_data';
            const targetKey = `${STORAGE_PREFIX}${targetSheetId}`;
            const targetDataRaw = localStorage.getItem(targetKey);
            let targetRecords = [];
            if (targetDataRaw) {
                try {
                    const parsed = JSON.parse(targetDataRaw);
                    if (Array.isArray(parsed)) targetRecords = parsed;
                } catch {}
            }

            // Clean trash metadata from restored record
            const { deletedAt, originSheetId, originSheetName, ...cleanRecord } = recordToRestore;
            cleanRecord.updated_at = new Date().toISOString();

            const updatedTarget = [cleanRecord, ...targetRecords].map((r, i) => sanitizeRecord(r, i)).filter(Boolean);
            sheetsAPI.saveSheetRecords(targetSheetId, updatedTarget);

            // Remove from trash
            const updatedTrash = records.filter(r => r.id !== recordToRestore.id);
            saveRecords(updatedTrash);

            const newSelected = new Set(selectedIds);
            newSelected.delete(recordToRestore.id);
            setSelectedIds(newSelected);

            const destName = recordToRestore.originSheetName || sheetsList.find(s => s.id === targetSheetId)?.name || 'الشيت الأصلي';
            showToast(`تم استرداد السجل بنجاح إلى "${destName}" ✓`, 'success');
        } catch (err) {
            console.error('Error restoring record:', err);
            showToast('حدث خطأ أثناء استرداد السجل', 'error');
        }
    };

    // Bulk Restore from trash
    const handleBulkRestore = () => {
        if (selectedIds.size === 0) return;
        try {
            const selectedRecords = records.filter(r => selectedIds.has(r.id));
            // Group by originSheetId
            const grouped = {};
            selectedRecords.forEach(rec => {
                const destId = rec.originSheetId || 'account_data';
                if (!grouped[destId]) grouped[destId] = [];
                const { deletedAt, originSheetId, originSheetName, ...cleanRec } = rec;
                cleanRec.updated_at = new Date().toISOString();
                grouped[destId].push(cleanRec);
            });

            // Save to each origin sheet
            Object.keys(grouped).forEach(destId => {
                const key = `${STORAGE_PREFIX}${destId}`;
                const raw = localStorage.getItem(key);
                let currentDestData = [];
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) currentDestData = parsed;
                    } catch {}
                }
                const updatedDest = [...grouped[destId], ...currentDestData].map((r, i) => sanitizeRecord(r, i)).filter(Boolean);
                sheetsAPI.saveSheetRecords(destId, updatedDest);
            });

            // Remove all restored from trash
            const updatedTrash = records.filter(r => !selectedIds.has(r.id));
            saveRecords(updatedTrash);
            setSelectedIds(new Set());
            showToast(`تم استرداد ${selectedRecords.length} سجل بنجاح إلى شيتاتها الأصلية ✓`, 'success');
        } catch (err) {
            console.error('Error in bulk restore:', err);
            showToast('حدث خطأ أثناء استرداد السجلات', 'error');
        }
    };

    // Empty entire trash
    const handleEmptyTrash = async () => {
        if (records.length === 0) return;
        const confirmed = await showConfirm({
            title: 'إفراغ سلة المهملات',
            message: 'تحذير: هل أنت متأكد من رغبتك في إفراغ سلة المهملات بالكامل؟ سيتم حذف جميع السجلات نهائياً ولا يمكن التراجع.',
            confirmText: 'نعم، إفراغ المهملات',
            cancelText: 'إلغاء',
            type: 'danger'
        });
        if (!confirmed) return;

        saveRecords([]);
        setSelectedIds(new Set());
        showToast('تم إفراغ سلة المهملات بالكامل بنجاح', 'info');
    };

    // Quick toggle payment status directly from table
    const handleTogglePaymentStatus = (id) => {
        let toastMsg = '';
        const updated = records.map(r => {
            if (r.id === id) {
                const nextStatus = r.paymentStatus === 'غير مدفوع' ? 'مدفوع' : 'غير مدفوع';
                toastMsg = nextStatus === 'مدفوع'
                    ? 'تم التحديد: مدفوع (تظليل أخضر فاتح) ✓'
                    : 'تم التحديد: غير مدفوع (تظليل أحمر فاتح) ✕';
                return { ...r, paymentStatus: nextStatus, updated_at: new Date().toISOString() };
            }
            return r;
        });
        saveRecords(updated);
        showToast(toastMsg || 'تم تحديث حالة الدفع بنجاح ✓', 'success');
    };

    // Quick toggle sale status directly from table (تم البيع / لم يتم البيع / إلغاء التظليل)
    const handleToggleSaleStatus = (id) => {
        if (!canEdit) {
            showToast('ليس لديك صلاحية تعديل السجلات', 'warning');
            return;
        }
        let toastMsg = '';
        let toastType = 'info';
        const updated = records.map(r => {
            if (r.id === id) {
                let nextStatus;
                if (r.saleStatus === 'sold' || r.isSold === true) {
                    nextStatus = 'unsold';
                    toastMsg = 'تم التحديد: لم يتم البيع (تظليل أحمر) ✕';
                    toastType = 'info';
                } else if (r.saleStatus === 'unsold' || r.isSold === false) {
                    nextStatus = null;
                    toastMsg = 'تم إلغاء التظليل وعودة السجل للونه الطبيعي';
                    toastType = 'info';
                } else {
                    nextStatus = 'sold';
                    toastMsg = 'تم التحديد: تم البيع (تظليل أخضر فاتح) ✓';
                    toastType = 'success';
                }
                return {
                    ...r,
                    saleStatus: nextStatus,
                    isSold: nextStatus === 'sold' ? true : nextStatus === 'unsold' ? false : null,
                    updated_at: new Date().toISOString()
                };
            }
            return r;
        });
        saveRecords(updated);
        showToast(toastMsg, toastType);
    };

    // Set specific sale status directly from dropdown menu (تم البيع / لم يتم البيع / إلغاء التظليل)
    const handleSetSaleStatus = (id, status) => {
        if (!canEdit) {
            showToast('ليس لديك صلاحية تعديل السجلات', 'warning');
            return;
        }
        const updated = records.map(r => {
            if (r.id === id) {
                return {
                    ...r,
                    saleStatus: status,
                    isSold: status === 'sold' ? true : status === 'unsold' ? false : null,
                    updated_at: new Date().toISOString()
                };
            }
            return r;
        });
        saveRecords(updated);
        if (status === 'sold') {
            showToast('تم التحديد: تم البيع (تظليل أخضر فاتح) ✓', 'success');
        } else if (status === 'unsold') {
            showToast('تم التحديد: لم يتم البيع (تظليل أحمر فاتح) ✕', 'info');
        } else {
            showToast('تم إلغاء التظليل وعودة السجل للوضع الطبيعي', 'info');
        }
    };

    // Delete Selected Records (Bulk soft-delete or permanent delete)
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (isTrashSheet) {
            const confirmed = await showConfirm({
                title: 'حذف السجلات نهائياً',
                message: `هل أنت متأكد من الحذف النهائي لـ ${selectedIds.size} سجل محدد؟ لن يمكن استعادتها.`,
                confirmText: 'نعم، احذف',
                cancelText: 'إلغاء',
                type: 'danger'
            });
            if (!confirmed) return;

            const updated = records.filter(r => !selectedIds.has(r.id));
            saveRecords(updated);
            setSelectedIds(new Set());
            showToast(`تم الحذف النهائي لـ ${selectedIds.size} سجل بنجاح`, 'info');
        } else {
            const confirmed = await showConfirm({
                title: 'نقل إلى سلة المهملات',
                message: `هل أنت متأكد من نقل ${selectedIds.size} سجل محدد إلى سلة المهملات؟`,
                confirmText: 'نعم، احذف',
                cancelText: 'إلغاء',
                type: 'danger'
            });
            if (!confirmed) return;

            const targetRecords = records.filter(r => selectedIds.has(r.id));
            moveToTrash(targetRecords, currentSheetId, currentSheet?.name || 'شيت');
            const updated = records.filter(r => !selectedIds.has(r.id));
            saveRecords(updated);
            setSelectedIds(new Set());
            showToast(`تم نقل ${targetRecords.length} سجل إلى سلة المهملات بنجاح ✓`, 'success');
        }
    };

    // Bulk Add from textarea (supports various delimiters: tab, colon, comma, pipe)
    const handleBulkAddSubmit = (e) => {
        e.preventDefault();
        if (!bulkText.trim()) return;

        const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
        const newItems = [];

        lines.forEach((line, idx) => {
            // Determine delimiter: tab, pipe, colon, comma
            let parts = [];
            if (line.includes('\t')) parts = line.split('\t');
            else if (line.includes('|')) parts = line.split('|');
            else if (line.includes(',')) parts = line.split(',');
            else if (line.includes(':')) parts = line.split(':');
            else parts = [line];

            parts = parts.map(p => p.trim());

            if (isCustomersSheet) {
                newItems.push({
                    id: 'REC-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 6),
                    name: parts[0] || '',
                    phone: parts[1] || '',
                    deviceType: parts[2] || '',
                    notes: parts[3] || '',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            } else if (isClientOrMerchant) {
                newItems.push({
                    id: 'REC-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 6),
                    email: parts[0] || '',
                    password: parts[1] || '',
                    password2: parts[2] || '',
                    duration: parts[3] || '',
                    startDate: parts[4] || '',
                    selectedAccount: parts[5] || '',
                    notes: parts[6] || '',
                    invoiceNumber: '',
                    visa: '',
                    visaAccount: '',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            } else {
                newItems.push({
                    id: 'REC-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 6),
                    email: parts[0] || '',
                    password: parts[1] || '',
                    password2: parts[2] || '',
                    invoiceNumber: parts[3] || '',
                    visa: parts[4] || '',
                    visaAccount: parts[5] || '',
                    selectedAccount: parts[6] || '',
                    notes: parts[7] || '',
                    duration: '',
                    startDate: '',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }
        });

        if (newItems.length > 0) {
            saveRecords([...newItems, ...records]);
            showToast(`تمت إضافة ${newItems.length} سجل بنجاح ✓`, 'success');
            setBulkText('');
            setShowBulkModal(false);
        }
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (records.length === 0) {
            showToast('لا توجد بيانات لتصديرها', 'warning');
            return;
        }

        let dataToExport;
        if (isCustomersSheet) {
            dataToExport = records.map((r, i) => ({
                'م': i + 1,
                'اسم العميل (Name)': r.name || '',
                'رقم التليفون (Phone)': r.phone || '',
                'نوع الاشتراك (Device / Subscription)': r.deviceType || 'جهاز',
                'ملاحظات': r.notes || '',
                'تاريخ الإضافة': r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : ''
            }));
        } else if (isTrashSheet) {
            dataToExport = records.map((r, i) => ({
                'م': i + 1,
                'البريد الإلكتروني (Email)': r.email || '',
                'الباسورد الأول (Password 1)': r.password || '',
                'الباسورد الثاني (Password 2)': r.password2 || '',
                'الشيت الأصلي': r.originSheetName || '',
                'بيانات الحساب (Account)': r.selectedAccount || '',
                'تاريخ الحذف': r.deletedAt ? new Date(r.deletedAt).toLocaleString('ar-EG') : '',
                'ملاحظات': r.notes || '',
                'تاريخ الإضافة': r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : ''
            }));
        } else if (isClientOrMerchant) {
            dataToExport = records.map((r, i) => ({
                'م': i + 1,
                'البريد الإلكتروني (Email)': r.email || '',
                'الباسورد الأول (Password 1)': r.password || '',
                'الباسورد الثاني (Password 2)': r.password2 || '',
                ...(currentSheetId === 'merchant_data'
                    ? { 'اسم التاجر (Merchant)': r.serviceType || '' }
                    : { 'الخدمة (Service)': r.serviceType || '' }),
                'مدة الاشتراك (Duration)': r.duration || '',
                'تاريخ بداية الاشتراك (Start Date)': r.startDate || '',
                ...(currentSheetId !== 'merchant_data' ? { 'نوع الاشتراك (Device Type)': r.deviceType || 'جهاز' } : {}),
                'حالة الدفع (Payment Status)': r.paymentStatus || 'مدفوع',
                'بيانات الحساب (Account)': r.selectedAccount || '',
                'ملاحظات': r.notes || '',
                'تاريخ الإضافة': r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : ''
            }));
        } else {
            dataToExport = records.map((r, i) => {
                const base = {
                    'م': i + 1,
                    'البريد الإلكتروني (Email)': r.email || '',
                    'كلمة المرور 1 (Password)': r.password || '',
                    'كلمة المرور 2 (Password 2)': r.password2 || '',
                    'رقم الفاتورة (Invoice)': r.invoiceNumber || '',
                    'الفيزا (Visa)': r.visa || '',
                    'حساب الفيزا (Visa Account)': r.visaAccount || ''
                };
                if (currentSheetId === 'account_data') {
                    const rem = calculateAccountReminder(r.accountCreatedDate, r.reminderDays, r.created_at);
                    base['تاريخ إنشاء الحساب (Creation Date)'] = r.accountCreatedDate || '';
                    base['فترة التذكير بالأيام (Reminder Days)'] = r.reminderDays || '';
                    base['حالة التذكير'] = rem.text || '';
                } else {
                    base['بيانات الحساب (Account)'] = r.selectedAccount || '';
                }
                base['ملاحظات'] = r.notes || '';
                base['تاريخ الإضافة'] = r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : '';
                return base;
            });
        }

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, currentSheet.name);
        XLSX.writeFile(wb, `${currentSheet.name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('تم تصدير ملف Excel بنجاح ✓', 'success');
    };

    // Export to JSON Backup
    const handleExportBackup = () => {
        const fullBackup = {};
        sheetsList.forEach(s => {
            try {
                const d = localStorage.getItem(`${STORAGE_PREFIX}${s.id}`);
                fullBackup[s.id] = d ? JSON.parse(d) : [];
            } catch {
                fullBackup[s.id] = [];
            }
        });

        const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Service_VIP_Sheets_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('تم حفظ نسخة احتياطية شاملة لجميع الشيتات بنجاح ✓', 'success');
    };

    // Import Excel or JSON
    const handleFileImport = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        if (file.name.endsWith('.json')) {
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                        // Multi-sheet backup
                        Object.keys(parsed).forEach(key => {
                            if (Array.isArray(parsed[key])) {
                                sheetsAPI.saveSheetRecords(key, parsed[key]);
                            }
                        });
                        loadCurrentSheetData();
                        refreshAllCounts();
                        showToast('تم استعادة جميع الشيتات من النسخة الاحتياطية بنجاح ✓', 'success');
                    } else if (Array.isArray(parsed)) {
                        // Single sheet
                        saveRecords([...parsed, ...records]);
                        showToast(`تم استيراد ${parsed.length} سجل بنجاح ✓`, 'success');
                    }
                } catch (err) {
                    showToast('ملف النسخ الاحتياطي غير صالح', 'error');
                }
            };
            reader.readAsText(file);
        } else {
            // Excel / CSV
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (jsonData.length <= 1) {
                        showToast('الملف فارغ أو لا يحتوي على صفوف بيانات', 'warning');
                        return;
                    }

                    // First row could be header
                    const rows = jsonData.slice(1);
                    const imported = rows.map((row, i) => {
                        if (isClientOrMerchant) {
                            return {
                                id: 'REC-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                                email: String(row[1] || row[0] || '').trim(),
                                password: String(row[2] || row[1] || '').trim(),
                                password2: String(row[3] || row[2] || '').trim(),
                                duration: String(row[4] || row[3] || '').trim(),
                                notes: String(row[5] || row[4] || '').trim(),
                                invoiceNumber: '',
                                visa: '',
                                visaAccount: '',
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };
                        }
                        return {
                            id: 'REC-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                            email: String(row[1] || row[0] || '').trim(),
                            password: String(row[2] || row[1] || '').trim(),
                            password2: String(row[3] || row[2] || '').trim(),
                            invoiceNumber: String(row[4] || row[3] || '').trim(),
                            visa: String(row[5] || row[4] || '').trim(),
                            visaAccount: String(row[6] || row[5] || '').trim(),
                            notes: String(row[7] || row[6] || '').trim(),
                            duration: '',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                    }).filter(r => r.email || r.password || r.duration || r.invoiceNumber || r.visa);

                    if (imported.length > 0) {
                        saveRecords([...imported, ...records]);
                        showToast(`تم استيراد ${imported.length} سجل من ملف الإكسيل بنجاح ✓`, 'success');
                    } else {
                        showToast('لم يتم العثور على سجلات صالحة للاستيراد', 'warning');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('حدث خطأ أثناء قراءة ملف الإكسيل', 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Rename sheet
    const handleRenameSheet = (e) => {
        e.preventDefault();
        if (!renameValue.trim()) return;
        const updated = sheetsList.map(s => {
            if (s.id === currentSheetId) {
                return { ...s, name: renameValue.trim() };
            }
            return s;
        });
        setSheetsList(updated);
        sheetsAPI.saveSheetsConfig(updated);
        setShowRenameModal(false);
        showToast('تم تحديث اسم الشيت بنجاح ✓', 'success');
    };

    // Subscriptions & Account Alert Groups (قرب التجديد / التذكير في آخر 3 أيام، ومنتهي/مستحق، وساري)
    const alertGroups = useMemo(() => {
        if (currentSheetId === 'trash_data' || currentSheetId === 'customers_data') {
            return { nearRenewal: [], expired: [], active: [] };
        }

        const nearRenewal = [];
        const expired = [];
        const active = [];

        records.forEach(r => {
            const rem = currentSheetId === 'account_data'
                ? calculateAccountReminder(r.accountCreatedDate, r.reminderDays, r.created_at)
                : calculateRemainingTime(r.startDate, r.duration, r.created_at);

            if (!rem || rem.status === 'none') return;

            if (rem.status === 'lifetime') {
                active.push({ ...r, remInfo: rem });
            } else if (rem.days !== null && rem.days < 0) {
                expired.push({ ...r, remInfo: rem });
            } else if (rem.days !== null && rem.days >= 0 && rem.days <= 3) {
                nearRenewal.push({ ...r, remInfo: rem });
            } else if (rem.days !== null && rem.days > 3) {
                active.push({ ...r, remInfo: rem });
            }
        });

        // Sort near renewal by fewest remaining days first
        nearRenewal.sort((a, b) => (a.remInfo.days ?? 0) - (b.remInfo.days ?? 0));
        // Sort expired by most recently expired first
        expired.sort((a, b) => (b.remInfo.days ?? 0) - (a.remInfo.days ?? 0));

        return { nearRenewal, expired, active };
    }, [records, currentSheetId]);

    // Filter & Search (bulletproof against numbers and nulls)
    const filteredRecords = useMemo(() => {
        let result = records;

        // Filter by Expiry Status Tab (All, Near Renewal, Expired, Active) - only for sheets with subscription dates
        if (currentSheetId !== 'customers_data') {
            if (expiryFilter === 'near') {
                result = result.filter(r => {
                    const rem = currentSheetId === 'account_data'
                        ? calculateAccountReminder(r.accountCreatedDate, r.reminderDays, r.created_at)
                        : calculateRemainingTime(r.startDate, r.duration, r.created_at);
                    return rem.days !== null && rem.days >= 0 && rem.days <= 3 && rem.status !== 'lifetime';
                });
            } else if (expiryFilter === 'expired') {
                result = result.filter(r => {
                    const rem = currentSheetId === 'account_data'
                        ? calculateAccountReminder(r.accountCreatedDate, r.reminderDays, r.created_at)
                        : calculateRemainingTime(r.startDate, r.duration, r.created_at);
                    return rem.days !== null && rem.days < 0;
                });
            } else if (expiryFilter === 'active') {
                result = result.filter(r => {
                    const rem = currentSheetId === 'account_data'
                        ? calculateAccountReminder(r.accountCreatedDate, r.reminderDays, r.created_at)
                        : calculateRemainingTime(r.startDate, r.duration, r.created_at);
                    return rem.days > 3 || rem.status === 'lifetime';
                });
            }
        }

        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase().trim();
            result = result.filter(r => {
                const rem = currentSheetId === 'account_data'
                    ? calculateAccountReminder(r.accountCreatedDate, r.reminderDays, r.created_at)
                    : calculateRemainingTime(r.startDate, r.duration, r.created_at);
                return (
                    String(r.name || '').toLowerCase().includes(q) ||
                    String(r.phone || '').toLowerCase().includes(q) ||
                    String(r.email || '').toLowerCase().includes(q) ||
                    String(r.password || '').toLowerCase().includes(q) ||
                    String(r.password2 || '').toLowerCase().includes(q) ||
                    String(r.serviceType || '').toLowerCase().includes(q) ||
                    String(r.originSheetName || '').toLowerCase().includes(q) ||
                    String(r.deletedAt || '').toLowerCase().includes(q) ||
                    String(r.duration || '').toLowerCase().includes(q) ||
                    String(r.startDate || '').toLowerCase().includes(q) ||
                    String(r.accountCreatedDate || '').toLowerCase().includes(q) ||
                    String(r.reminderDays || '').toLowerCase().includes(q) ||
                    String(r.deviceType || '').toLowerCase().includes(q) ||
                    String(r.paymentStatus || '').toLowerCase().includes(q) ||
                    String(rem?.text || '').toLowerCase().includes(q) ||
                    String(r.invoiceNumber || '').toLowerCase().includes(q) ||
                    String(r.visa || '').toLowerCase().includes(q) ||
                    String(r.visaAccount || '').toLowerCase().includes(q) ||
                    String(r.notes || '').toLowerCase().includes(q)
                );
            });
        }

        // Sorting
        result = [...result].sort((a, b) => {
            if (sortBy.field === 'created_at' || sortBy.field === 'email' || sortBy.field === 'order' || sortBy.field === 'rowNumber') {
                const getRecordTimestamp = (rec) => {
                    if (rec.created_at) {
                        const t = new Date(rec.created_at).getTime();
                        if (!isNaN(t) && t > 0) return t;
                    }
                    if (typeof rec.id === 'string' && rec.id.startsWith('REC-')) {
                        const parts = rec.id.split('-');
                        if (parts.length >= 2) {
                            const num = Number(parts[1]);
                            if (!isNaN(num) && num > 1000000000000) return num;
                        }
                    }
                    if (rec.accountCreatedDate) {
                        const t = new Date(rec.accountCreatedDate).getTime();
                        if (!isNaN(t) && t > 0) return t;
                    }
                    if (rec.startDate) {
                        const t = new Date(rec.startDate).getTime();
                        if (!isNaN(t) && t > 0) return t;
                    }
                    return 0;
                };
                const timeA = getRecordTimestamp(a);
                const timeB = getRecordTimestamp(b);
                if (timeA !== timeB) {
                    return sortBy.asc ? (timeA - timeB) : (timeB - timeA);
                }
                return sortBy.asc ? (a._originalIndex - b._originalIndex) : (b._originalIndex - a._originalIndex);
            }

            if (sortBy.field === 'deletedAt') {
                const timeA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
                const timeB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
                if (timeA < timeB) return sortBy.asc ? -1 : 1;
                if (timeA > timeB) return sortBy.asc ? 1 : -1;
                return 0;
            }
            if (sortBy.field === 'accountCreatedDate') {
                const getAccountDate = (rec) => {
                    if (rec.accountCreatedDate) {
                        const t = new Date(rec.accountCreatedDate).getTime();
                        if (!isNaN(t) && t > 0) return t;
                    }
                    if (rec.created_at) {
                        const t = new Date(rec.created_at).getTime();
                        if (!isNaN(t) && t > 0) return t;
                    }
                    return 0;
                };
                const timeA = getAccountDate(a);
                const timeB = getAccountDate(b);
                if (timeA !== timeB) {
                    return sortBy.asc ? (timeA - timeB) : (timeB - timeA);
                }
                return sortBy.asc ? (a._originalIndex - b._originalIndex) : (b._originalIndex - a._originalIndex);
            }
            if (sortBy.field === 'accountReminderDays') {
                const daysA = calculateAccountReminder(a.accountCreatedDate, a.reminderDays, a.created_at).days ?? -999999;
                const daysB = calculateAccountReminder(b.accountCreatedDate, b.reminderDays, b.created_at).days ?? -999999;
                if (daysA < daysB) return sortBy.asc ? -1 : 1;
                if (daysA > daysB) return sortBy.asc ? 1 : -1;
                return 0;
            }
            if (sortBy.field === 'remainingDays' || sortBy.field === 'startDate') {
                const daysA = calculateRemainingTime(a.startDate, a.duration, a.created_at).days ?? -999999;
                const daysB = calculateRemainingTime(b.startDate, b.duration, b.created_at).days ?? -999999;
                if (daysA < daysB) return sortBy.asc ? -1 : 1;
                if (daysA > daysB) return sortBy.asc ? 1 : -1;
                return 0;
            }
            const valA = String(a[sortBy.field] ?? '').toLowerCase();
            const valB = String(b[sortBy.field] ?? '').toLowerCase();

            if (valA < valB) return sortBy.asc ? -1 : 1;
            if (valA > valB) return sortBy.asc ? 1 : -1;
            return 0;
        });

        return result;
    }, [records, searchTerm, sortBy, expiryFilter, currentSheetId]);

    // Pagination
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    const paginatedRecords = useMemo(() => {
        if (pageSize === 'all') return filteredRecords;
        const start = (currentPage - 1) * pageSize;
        return filteredRecords.slice(start, start + pageSize);
    }, [filteredRecords, currentPage, pageSize]);

    // Selection helper
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allIds = new Set(filteredRecords.map(r => r.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelectRow = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    // Stats calculations
    const stats = useMemo(() => {
        const total = records.length;
        if (currentSheetId === 'trash_data') {
            const accountsCount = records.filter(r => r.originSheetId === 'account_data').length;
            const clientsCount = records.filter(r => r.originSheetId === 'client_data').length;
            const merchantsCount = records.filter(r => r.originSheetId === 'merchant_data').length;
            return {
                total,
                accountsCount,
                clientsCount,
                merchantsCount,
                nearCount: 0,
                expiredCount: 0
            };
        }

        if (isCustomersSheet) {
            const withPhone = records.filter(r => r.phone && r.phone.trim()).length;
            const withSubscription = records.filter(r => r.deviceType && r.deviceType.trim()).length;
            const withNotes = records.filter(r => r.notes && r.notes.trim()).length;
            return {
                total,
                withPhone,
                withSubscription,
                withNotes,
                nearCount: 0,
                expiredCount: 0
            };
        }

        const withInvoices = records.filter(r => r.invoiceNumber).length;
        const withVisa = records.filter(r => r.visa).length;
        const withVisaAccount = records.filter(r => r.visaAccount).length;
        const withDuration = records.filter(r => r.duration).length;
        const withBothPasswords = records.filter(r => r.password && r.password2).length;
        const withEmail = records.filter(r => r.email).length;
        const withReminder = records.filter(r => r.reminderDays && parseInt(r.reminderDays) > 0).length;
        return {
            total,
            withInvoices,
            withVisa,
            withVisaAccount,
            withDuration,
            withBothPasswords,
            withEmail,
            withReminder,
            nearCount: alertGroups.nearRenewal.length,
            expiredCount: alertGroups.expired.length
        };
    }, [records, alertGroups, currentSheetId, isCustomersSheet]);

    return (
        <div className="space-y-6 animate-fade-in font-sans pb-12">
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-white font-bold text-sm backdrop-blur-md transition-all duration-300 ${
                    toast.type === 'success' ? 'bg-emerald-600/95 shadow-emerald-500/30' :
                    toast.type === 'error' ? 'bg-red-600/95 shadow-red-500/30' :
                    toast.type === 'warning' ? 'bg-amber-600/95 shadow-amber-500/30' :
                    'bg-blue-600/95 shadow-blue-500/30'
                }`}>
                    <i className={`fa-solid ${
                        toast.type === 'success' ? 'fa-circle-check' :
                        toast.type === 'error' ? 'fa-circle-xmark' :
                        toast.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'
                    } text-lg`}></i>
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Header & Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500">
                            {isTrashSheet ? 'إجمالي المحذوفات' : 'إجمالي السجلات'}
                        </p>
                        <h4 className={`text-2xl font-black ${isTrashSheet ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'} mt-1`}>
                            {stats.total}
                        </h4>
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${isTrashSheet ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'} flex items-center justify-center text-xl`}>
                        <i className={`fa-solid ${isTrashSheet ? 'fa-trash-can' : 'fa-list-check'}`}></i>
                    </div>
                </div>

                {isTrashSheet ? (
                    <>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">حسابات محذوفة</p>
                                <h4 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.accountsCount}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-user-gear"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">عملاء محذوفين</p>
                                <h4 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.clientsCount}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-users"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">تجار محذوفين</p>
                                <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.merchantsCount}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-store"></i>
                            </div>
                        </div>
                    </>
                ) : isCustomersSheet ? (
                    <>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">أرقام هواتف مسجلة</p>
                                <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.withPhone}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-phone-volume"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">نوع الاشتراك مسجل</p>
                                <h4 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.withSubscription}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-tag"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">سجلات بملاحظات</p>
                                <h4 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.withNotes}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-note-sticky"></i>
                            </div>
                        </div>
                    </>
                ) : isClientOrMerchant ? (
                    <>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">مدة اشتراك مسجلة</p>
                                <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.withDuration}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
                                <i className="fa-regular fa-clock"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">باسورد أول وثانٍ</p>
                                <h4 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.withBothPasswords}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-shield-halved"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">إيميلات مسجلة</p>
                                <h4 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.withEmail}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-envelope"></i>
                            </div>
                        </div>
                    </>
                ) : currentSheetId === 'account_data' ? (
                    <>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">حسابات بتذكير محدد</p>
                                <h4 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.withReminder}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-bell"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">تذكيرات قريبة / مستحقة</p>
                                <h4 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.nearCount + stats.expiredCount}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">إيميلات مسجلة</p>
                                <h4 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.withEmail}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-envelope"></i>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">سجلات بفواتير</p>
                                <h4 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.withInvoices}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-receipt"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">سجلات بفيزا</p>
                                <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.withVisa}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-credit-card"></i>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">حسابات الفيزا</p>
                                <h4 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.withVisaAccount}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
                                <i className="fa-solid fa-building-columns"></i>
                            </div>
                        </div>
                    </>
                )}
            </div>



            {/* Main Action Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Title and rename button */}
                    <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${currentSheet.color} text-white flex items-center justify-center text-xl shadow-md`}>
                            <i className={`fa-solid ${currentSheet.icon}`}></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg md:text-xl font-black text-slate-800 dark:text-white">
                                    {currentSheet.name}
                                </h2>
                                {canCustomize && (
                                    <button
                                        onClick={() => {
                                            setRenameValue(currentSheet.name);
                                            setShowRenameModal(true);
                                        }}
                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition text-xs p-1"
                                        title="تعديل اسم الشيت"
                                    >
                                        <i className="fa-solid fa-pen-to-square"></i>
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                {isTrashSheet
                                    ? 'سلة المهملات: استعراض الحسابات والبيانات المحذوفة مع إمكانية استردادها للشيت الأصلي أو حذفها نهائياً'
                                    : isCustomersSheet
                                    ? 'إدارة وحفظ بيانات العملاء وأرقام الهواتف ونوع الاشتراك والتواصل السريع'
                                    : isClientOrMerchant
                                    ? 'إدارة وحفظ بيانات الإيميل والباسورد الأول والثاني ومدة الاشتراك محلياً'
                                    : currentSheetId === 'account_data'
                                    ? 'إدارة وحفظ بيانات الحسابات وتاريخ الإنشاء وفترة التذكير محلياً'
                                    : 'إدارة وحفظ البيانات محلياً'}
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                        {isTrashSheet ? (
                            <>
                                {records.length > 0 && canEmptyTrash && (
                                    <button
                                        onClick={handleEmptyTrash}
                                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 shadow-xs transition transform active:scale-95 cursor-pointer"
                                        title="حذف جميع السجلات في سلة المهملات نهائياً"
                                    >
                                        <i className="fa-solid fa-trash-can"></i>
                                        <span>إفراغ سلة المهملات</span>
                                    </button>
                                )}
                            </>
                        ) : (
                            /* Add Single Record */
                            canAdd && (
                                <button
                                    onClick={() => {
                                        refreshAvailableAccounts();
                                        setEditingRecord(null);
                                        setFormData({
                                            name: '',
                                            phone: '',
                                            email: '',
                                            password: '',
                                            password2: '',
                                            duration: '',
                                            startDate: new Date().toISOString().slice(0, 10),
                                            deviceType: isCustomersSheet ? '' : 'جهاز',
                                            paymentStatus: 'مدفوع',
                                            selectedAccount: '',
                                            invoiceNumber: '',
                                            visa: '',
                                            visaAccount: '',
                                            notes: '',
                                            accountCreatedDate: new Date().toISOString().slice(0, 10),
                                            reminderDays: '30'
                                        });
                                        setShowAddModal(true);
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition transform active:scale-95 cursor-pointer"
                                >
                                    <i className="fa-solid fa-plus"></i>
                                    <span>إضافة بيانات جديدة</span>
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {/* Live Search */}
                    <div className="relative w-full md:w-96">
                        <i className="fa-solid fa-magnifying-glass absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={
                                currentSheetId === 'customers_data'
                                    ? "بحث في اسم العميل، رقم التليفون، نوع الاشتراك، الملاحظات..."
                                    : currentSheetId === 'merchant_data'
                                    ? "بحث في الإيميل، اسم التاجر، مدة الاشتراك..."
                                    : currentSheetId === 'client_data'
                                    ? "بحث في الإيميل، الخدمة، مدة الاشتراك..."
                                    : currentSheetId === 'account_data'
                                    ? "بحث في الإيميل، الباسورد، تاريخ الإنشاء، التذكير، الملاحظات..."
                                    : "بحث في الإيميل، الباسورد، الفاتورة، الفيزا، الملاحظات..."
                            }
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        )}
                    </div>

                    {/* Sorting & Page Sizing */}
                    <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
                        {/* Chronological Sort Toggle Button */}
                        <button
                            onClick={() => setSortBy(prev => ({
                                field: 'created_at',
                                asc: (prev.field === 'created_at' || prev.field === 'email') ? !prev.asc : true
                            }))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition shadow-sm select-none cursor-pointer"
                            title="انقر لتبديل ترتيب البيانات من الأحدث للأقدم أو من الأقدم للأحدث"
                        >
                            <i className={`fa-solid ${(sortBy.field === 'created_at' || sortBy.field === 'email') && sortBy.asc ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short'} text-xs`}></i>
                            <span>{(sortBy.field === 'created_at' || sortBy.field === 'email') && sortBy.asc ? 'الترتيب: من الأقدم للأحدث' : 'الترتيب: من الأحدث للأقدم'}</span>
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-bold hidden sm:inline">عرض:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value="all">الكل</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right text-[10.5px] border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-700/80 font-bold select-none">
                                <th
                                    onClick={() => setSortBy(prev => ({
                                        field: 'created_at',
                                        asc: (prev.field === 'created_at' || prev.field === 'email') ? !prev.asc : true
                                    }))}
                                    className="px-1 py-1 min-w-[36px] text-center cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none group"
                                    title={(sortBy.field === 'created_at' || sortBy.field === 'email') ? (sortBy.asc ? 'الترتيب: من الأقدم للأحدث (انقر للتبديل للأحدث)' : 'الترتيب: من الأحدث للأقدم (انقر للتبديل للأقدم)') : 'ترتيب السجلات: انقر للتبديل بين الأقدم والأحدث'}
                                >
                                    <div className="flex items-center justify-center gap-0.5">
                                        <span className="font-bold text-[10.5px]">#</span>
                                        <i className={`fa-solid text-[8px] transition-colors ${
                                            (sortBy.field === 'created_at' || sortBy.field === 'email')
                                                ? (sortBy.asc ? 'fa-arrow-up-wide-short text-indigo-600 dark:text-indigo-400 font-bold' : 'fa-arrow-down-wide-short text-indigo-600 dark:text-indigo-400 font-bold')
                                                : 'fa-sort text-slate-400 group-hover:text-indigo-500'
                                        }`}></i>
                                    </div>
                                </th>
                                {isCustomersSheet ? (
                                    <>
                                        <th
                                            onClick={() => setSortBy(prev => ({ field: 'name', asc: prev.field === 'name' ? !prev.asc : true }))}
                                            className="px-2.5 py-1.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none group"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>اسم العميل</span>
                                                <i className={`fa-solid text-[9px] transition-colors ${
                                                    sortBy.field === 'name'
                                                        ? (sortBy.asc ? 'fa-arrow-up-wide-short text-indigo-600 dark:text-indigo-400 font-bold' : 'fa-arrow-down-wide-short text-indigo-600 dark:text-indigo-400 font-bold')
                                                        : 'fa-sort text-slate-400 group-hover:text-indigo-500'
                                                }`}></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy(prev => ({ field: 'phone', asc: prev.field === 'phone' ? !prev.asc : true }))}
                                            className="px-2.5 py-1.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none group"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>رقم التليفون</span>
                                                <i className={`fa-solid text-[9px] transition-colors ${
                                                    sortBy.field === 'phone'
                                                        ? (sortBy.asc ? 'fa-arrow-up-wide-short text-indigo-600 dark:text-indigo-400 font-bold' : 'fa-arrow-down-wide-short text-indigo-600 dark:text-indigo-400 font-bold')
                                                        : 'fa-sort text-slate-400 group-hover:text-indigo-500'
                                                }`}></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy(prev => ({ field: 'deviceType', asc: prev.field === 'deviceType' ? !prev.asc : true }))}
                                            className="px-2.5 py-1.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none group"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>نوع الاشتراك</span>
                                                <i className={`fa-solid text-[9px] transition-colors ${
                                                    sortBy.field === 'deviceType'
                                                        ? (sortBy.asc ? 'fa-arrow-up-wide-short text-indigo-600 dark:text-indigo-400 font-bold' : 'fa-arrow-down-wide-short text-indigo-600 dark:text-indigo-400 font-bold')
                                                        : 'fa-sort text-slate-400 group-hover:text-indigo-500'
                                                }`}></i>
                                            </div>
                                        </th>
                                        <th className="px-2.5 py-1.5">ملاحظات</th>
                                        <th
                                            onClick={() => setSortBy(prev => ({ field: 'created_at', asc: prev.field === 'created_at' ? !prev.asc : true }))}
                                            className="px-2.5 py-1.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none group"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>تاريخ الإضافة</span>
                                                <i className={`fa-solid text-[9px] transition-colors ${
                                                    sortBy.field === 'created_at'
                                                        ? (sortBy.asc ? 'fa-arrow-up-wide-short text-indigo-600 dark:text-indigo-400 font-bold' : 'fa-arrow-down-wide-short text-indigo-600 dark:text-indigo-400 font-bold')
                                                        : 'fa-sort text-slate-400 group-hover:text-indigo-500'
                                                }`}></i>
                                            </div>
                                        </th>
                                    </>
                                ) : (
                                    <>
                                        <th
                                            onClick={() => setSortBy(prev => ({
                                                field: 'created_at',
                                                asc: (prev.field === 'created_at' || prev.field === 'email') ? !prev.asc : true
                                            }))}
                                            className="px-1 py-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none group"
                                            title={(sortBy.field === 'created_at' || sortBy.field === 'email') ? (sortBy.asc ? 'الترتيب: من الأقدم للأحدث (انقر للتبديل للأحدث)' : 'الترتيب: من الأحدث للأقدم (انقر للتبديل للأقدم)') : 'ترتيب السجلات: انقر للتبديل بين الأقدم والأحدث'}
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>البريد الإلكتروني</span>
                                                <i className={`fa-solid text-[9px] transition-colors ${
                                                    (sortBy.field === 'created_at' || sortBy.field === 'email')
                                                        ? (sortBy.asc ? 'fa-arrow-up-wide-short text-indigo-600 dark:text-indigo-400 font-bold' : 'fa-arrow-down-wide-short text-indigo-600 dark:text-indigo-400 font-bold')
                                                        : 'fa-sort text-slate-400 group-hover:text-indigo-500'
                                                }`}></i>
                                            </div>
                                        </th>
                                        <th className="px-1 py-1">الباسورد (1)</th>
                                        <th className="px-1 py-1">الباسورد (2)</th>
                                        {isTrashSheet ? (
                                    <>
                                        <th
                                            onClick={() => setSortBy({ field: 'originSheetName', asc: sortBy.field === 'originSheetName' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-rose-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>الشيت الأصلي</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy({ field: 'deletedAt', asc: sortBy.field === 'deletedAt' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-rose-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>تاريخ الحذف</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy({ field: 'selectedAccount', asc: sortBy.field === 'selectedAccount' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-purple-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>بيانات الحساب</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                    </>
                                ) : isClientOrMerchant ? (
                                    <>
                                        <th
                                            onClick={() => setSortBy({ field: 'serviceType', asc: sortBy.field === 'serviceType' ? !sortBy.asc : true })}
                                            className="px-1 py-1 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>{currentSheetId === 'merchant_data' ? 'اسم التاجر' : 'الخدمة'}</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy({ field: 'duration', asc: sortBy.field === 'duration' ? !sortBy.asc : true })}
                                            className="px-1 py-1 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>مدة الاشتراك</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy({ field: 'remainingDays', asc: sortBy.field === 'remainingDays' ? !sortBy.asc : true })}
                                            className="px-1 py-1 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>المدة المتبقية</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        {currentSheetId !== 'merchant_data' && (
                                            <th
                                                onClick={() => setSortBy({ field: 'deviceType', asc: sortBy.field === 'deviceType' ? !sortBy.asc : true })}
                                                className="px-1 py-1 cursor-pointer hover:text-indigo-600 transition"
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>نوع الاشتراك</span>
                                                    <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                                </div>
                                            </th>
                                        )}
                                        <th
                                            onClick={() => setSortBy({ field: 'paymentStatus', asc: sortBy.field === 'paymentStatus' ? !sortBy.asc : true })}
                                            className="px-1 py-1 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>حالة الدفع</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                    </>
                                ) : currentSheetId === 'account_data' ? (
                                    <>
                                        <th
                                            onClick={() => setSortBy({ field: 'accountCreatedDate', asc: sortBy.field === 'accountCreatedDate' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>تاريخ الإنشاء</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => setSortBy({ field: 'accountReminderDays', asc: sortBy.field === 'accountReminderDays' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>التذكير</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                    </>
                                ) : (
                                    <>
                                        <th
                                            onClick={() => setSortBy({ field: 'invoiceNumber', asc: sortBy.field === 'invoiceNumber' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>رقم الفاتورة</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                        <th className="px-1.5 py-1.5">الفيزا</th>
                                        <th className="px-1.5 py-1.5">حساب الفيزا</th>
                                        <th
                                            onClick={() => setSortBy({ field: 'selectedAccount', asc: sortBy.field === 'selectedAccount' ? !sortBy.asc : true })}
                                            className="px-1.5 py-1.5 cursor-pointer hover:text-indigo-600 transition"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>بيانات الحساب</span>
                                                <i className="fa-solid fa-sort text-[8px] text-slate-400"></i>
                                            </div>
                                        </th>
                                    </>
                                )}
                                    </>
                                )}
                                 <th className={`px-1 py-1.5 text-center ${currentSheetId === 'account_data' ? 'min-w-[115px]' : 'min-w-[56px]'} text-[10.5px] sticky left-0 z-10 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-xs shadow-[-3px_0_6px_rgba(0,0,0,0.06)] border-r border-slate-200/80 dark:border-slate-700/80`}>إجراءات</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                            {paginatedRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={isCustomersSheet ? 7 : isTrashSheet ? 8 : (currentSheetId === 'merchant_data' ? 9 : (isClientOrMerchant ? 10 : (currentSheetId === 'account_data' ? 7 : 9)))} className="p-12 text-center text-slate-400">
                                        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-2xl">
                                            <i className={`fa-solid ${isTrashSheet ? 'fa-trash-can text-rose-400' : 'fa-folder-open'}`}></i>
                                        </div>
                                        <p className="font-bold text-sm">
                                            {isTrashSheet ? 'سلة المهملات فارغة تماماً' : 'لا توجد سجلات في هذا الشيت حتى الآن'}
                                        </p>
                                        <p className="text-xs mt-1 text-slate-400">
                                            {isTrashSheet ? 'أي حسابات أو بيانات يتم حذفها ستظهر هنا ويمكنك استردادها في أي وقت' : 'انقر على "إضافة بيان جديد" للبدء في حفظ البيانات'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedRecords.map((rec, index) => {
                                    const rowNum = pageSize === 'all' ? index + 1 : (currentPage - 1) * pageSize + index + 1;
                                    const isSelected = selectedIds.has(rec.id);

                                    const isPassVisible = visibleSecrets[`${rec.id}_pass`];
                                    const isPass2Visible = visibleSecrets[`${rec.id}_pass2`];
                                    const isVisaVisible = visibleSecrets[`${rec.id}_visa`];

                                    const isAccountSheet = currentSheetId === 'account_data';
                                    const isClientOrMerchantSheet = currentSheetId === 'client_data' || currentSheetId === 'merchant_data';

                                    const isSold = isAccountSheet && (rec.saleStatus === 'sold' || rec.isSold === true);
                                    const isUnsold = isAccountSheet && (rec.saleStatus === 'unsold' || rec.isSold === false);

                                    const isPaid = isClientOrMerchantSheet && (rec.paymentStatus === 'مدفوع' || (!rec.paymentStatus && currentSheetId !== 'trash_data'));
                                    const isUnpaid = isClientOrMerchantSheet && (rec.paymentStatus === 'غير مدفوع');

                                    const isGreen = isSold || isPaid;
                                    const isRed = isUnsold || isUnpaid;

                                    const rowBgClass = isGreen
                                        ? 'bg-emerald-100/90 dark:bg-emerald-950/60 hover:bg-emerald-200/90 dark:hover:bg-emerald-900/70 border-b border-emerald-200/80 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-50'
                                        : isRed
                                            ? 'bg-rose-100/90 dark:bg-rose-950/60 hover:bg-rose-200/90 dark:hover:bg-rose-900/70 border-b border-rose-200/80 dark:border-rose-800/60 text-rose-950 dark:text-rose-50'
                                            : 'hover:bg-indigo-50/30 dark:hover:bg-slate-800/50';

                                    const stickyActionBgClass = isGreen
                                        ? 'bg-emerald-100/95 dark:bg-emerald-950/90 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900'
                                        : isRed
                                            ? 'bg-rose-100/95 dark:bg-rose-950/90 group-hover:bg-rose-200 dark:group-hover:bg-rose-900'
                                            : 'bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90';

                                    return (
                                        <tr
                                            key={rec.id}
                                            className={`transition-colors group ${rowBgClass}`}
                                        >
                                            {/* Row # */}
                                            <td className="px-1 py-1 text-center font-mono text-slate-400 text-[10px]">
                                                {rowNum}
                                            </td>

                                            {isCustomersSheet ? (
                                                <>
                                                    {/* Name */}
                                                    <td className="px-2.5 py-1.5 font-medium">
                                                        {rec.name ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                                                    <i className="fa-solid fa-user"></i>
                                                                </div>
                                                                <span className="text-slate-800 dark:text-slate-100 font-bold text-xs">
                                                                    {rec.name}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.name, `nm_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                    title="نسخ الاسم"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `nm_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[9px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Phone */}
                                                    <td className="px-2.5 py-1.5 font-medium">
                                                        {rec.phone ? (
                                                            <div className="flex items-center gap-1.5 dir-ltr justify-end">
                                                                <span className="font-mono text-slate-800 dark:text-slate-200 select-all text-xs font-bold">
                                                                    {rec.phone}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.phone, `ph_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 transition"
                                                                    title="نسخ رقم التليفون"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `ph_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[10px]`}></i>
                                                                </button>
                                                                <a
                                                                    href={`https://wa.me/${rec.phone.replace(/[^0-9]/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition"
                                                                    title="محادثة واتساب مباشرة"
                                                                >
                                                                    <i className="fa-brands fa-whatsapp text-[11px]"></i>
                                                                </a>
                                                                <a
                                                                    href={`tel:${rec.phone}`}
                                                                    className="w-5 h-5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white flex items-center justify-center transition"
                                                                    title="اتصال هاتفي"
                                                                >
                                                                    <i className="fa-solid fa-phone text-[9px]"></i>
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Device / Subscription Type */}
                                                    <td className="px-2.5 py-1.5">
                                                        {rec.deviceType ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold border bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60 shadow-xs">
                                                                <i className="fa-solid fa-tag text-[8.5px]"></i>
                                                                <span>{rec.deviceType}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Notes */}
                                                    <td className="px-2.5 py-1.5">
                                                        {rec.notes ? (
                                                            <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[220px] block" title={rec.notes}>
                                                                {rec.notes}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Date Added */}
                                                    <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">
                                                        {rec.created_at ? new Date(rec.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Email */}
                                            <td className="px-1 py-1 font-medium">
                                                {rec.email ? (
                                                    <div className="flex items-center gap-1 dir-ltr justify-end">
                                                        {rec.notes && (
                                                            <span title={`ملاحظات: ${rec.notes}`} className="text-amber-500/80 hover:text-amber-500 cursor-help mr-0.5">
                                                                <i className="fa-solid fa-note-sticky text-[8px]"></i>
                                                            </span>
                                                        )}
                                                        <span className="font-mono text-slate-800 dark:text-slate-200 select-all text-[10.5px] truncate max-w-[180px]" title={rec.email}>
                                                            {rec.email}
                                                        </span>
                                                        <button
                                                            onClick={() => handleCopy(rec.email, `em_${rec.id}`)}
                                                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                            title="نسخ الإيميل"
                                                        >
                                                            <i className={`fa-solid ${copiedField === `em_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600">-</span>
                                                )}
                                            </td>

                                            {/* Password 1 */}
                                            <td className="px-1 py-1 font-medium">
                                                {rec.password ? (
                                                    <div className="flex items-center gap-1 dir-ltr justify-end">
                                                        <span className="font-mono text-slate-800 dark:text-slate-200 select-all text-[10.5px]">
                                                            {isPassVisible ? rec.password : '••••••••'}
                                                        </span>
                                                        <button
                                                            onClick={() => toggleSecret(rec.id, 'pass')}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 transition"
                                                            title={isPassVisible ? 'إخفاء' : 'إظهار'}
                                                        >
                                                            <i className={`fa-solid ${isPassVisible ? 'fa-eye-slash' : 'fa-eye'} text-[8px]`}></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleCopy(rec.password, `p1_${rec.id}`)}
                                                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                            title="نسخ الباسورد"
                                                        >
                                                            <i className={`fa-solid ${copiedField === `p1_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600">-</span>
                                                )}
                                            </td>

                                            {/* Password 2 */}
                                            <td className="px-1 py-1 font-medium">
                                                {rec.password2 ? (
                                                    <div className="flex items-center gap-1 dir-ltr justify-end">
                                                        <span className="font-mono text-slate-800 dark:text-slate-200 select-all text-[10.5px]">
                                                            {isPass2Visible ? rec.password2 : '••••••••'}
                                                        </span>
                                                        <button
                                                            onClick={() => toggleSecret(rec.id, 'pass2')}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 transition"
                                                            title={isPass2Visible ? 'إخفاء' : 'إظهار'}
                                                        >
                                                            <i className={`fa-solid ${isPass2Visible ? 'fa-eye-slash' : 'fa-eye'} text-[8px]`}></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleCopy(rec.password2, `p2_${rec.id}`)}
                                                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                            title="نسخ الباسورد 2"
                                                        >
                                                            <i className={`fa-solid ${copiedField === `p2_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600">-</span>
                                                )}
                                            </td>

                                            {/* Columns branch */}
                                            {isTrashSheet ? (
                                                <>
                                                    {/* Origin Sheet Badge */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {(() => {
                                                            const originId = rec.originSheetId || 'account_data';
                                                            const originBadgeStyles = {
                                                                client_data: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/60',
                                                                merchant_data: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/60',
                                                                account_data: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/70 dark:border-purple-800/60',
                                                            }[originId] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200';

                                                            const originIcon = {
                                                                client_data: 'fa-solid fa-users text-blue-500',
                                                                merchant_data: 'fa-solid fa-store text-emerald-500',
                                                                account_data: 'fa-solid fa-user-gear text-purple-500',
                                                            }[originId] || 'fa-solid fa-file text-slate-400';

                                                            const name = rec.originSheetName || sheetsList.find(s => s.id === originId)?.name || 'بيانات الحساب';

                                                            return (
                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${originBadgeStyles} whitespace-nowrap`}>
                                                                    <i className={`${originIcon} text-[8px]`}></i>
                                                                    <span>{name}</span>
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>

                                                    {/* Deleted At Date */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {rec.deletedAt ? (
                                                            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                                <i className="fa-regular fa-clock text-rose-400 text-[8px]"></i>
                                                                <span>{new Date(rec.deletedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600">-</span>
                                                        )}
                                                    </td>

                                                    {/* Account Data in Trash */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {rec.selectedAccount ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60 shadow-xs whitespace-nowrap font-mono">
                                                                    <i className="fa-solid fa-shield-halved text-[8px] text-purple-500"></i>
                                                                    <span>{rec.selectedAccount}</span>
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.selectedAccount, `acc_tr_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 p-0.5 transition"
                                                                    title="نسخ بيانات الحساب"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `acc_tr_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>
                                                </>
                                            ) : isClientOrMerchant ? (
                                                <>
                                                    {/* Service Type (الخدمة أو اسم التاجر) */}
                                                    <td className="px-1 py-1 font-medium">
                                                        {(() => {
                                                            const sType = rec.serviceType || '';
                                                            if (!sType) return <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>;
                                                            if (currentSheetId === 'merchant_data') {
                                                                return (
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200/80 shadow-xs whitespace-nowrap">
                                                                            <i className="fa-solid fa-store text-[8px] text-amber-500"></i>
                                                                            <span>{sType}</span>
                                                                        </span>
                                                                        <button
                                                                            onClick={() => handleCopy(sType, `st_${rec.id}`)}
                                                                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                            title="نسخ اسم التاجر"
                                                                        >
                                                                            <i className={`fa-solid ${copiedField === `st_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                        </button>
                                                                    </div>
                                                                );
                                                            }
                                                            const opt = SERVICE_TYPE_OPTIONS.find(o => o.value === sType);
                                                            const badgeClass = opt?.badge || 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/80';
                                                            const iconClass = opt?.icon || 'fa-solid fa-tag';
                                                            return (
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeClass} shadow-xs whitespace-nowrap`}>
                                                                        <i className={`${iconClass} text-[8px]`}></i>
                                                                        <span>{sType}</span>
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleCopy(sType, `st_${rec.id}`)}
                                                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                        title="نسخ نوع الخدمة"
                                                                    >
                                                                        <i className={`fa-solid ${copiedField === `st_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>

                                                    <td className="px-1 py-1 font-medium">
                                                        {rec.duration ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60 whitespace-nowrap">
                                                                    <i className="fa-regular fa-clock text-[8px] text-indigo-500"></i>
                                                                    <span>{rec.duration}</span>
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.duration, `dur_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                    title="نسخ مدة الاشتراك"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `dur_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600">-</span>
                                                        )}
                                                    </td>
                                                    {/* Remaining Time (المدة المتبقية) */}
                                                    <td className="px-1 py-1 font-medium">
                                                        {(() => {
                                                            const remaining = calculateRemainingTime(rec.startDate, rec.duration, rec.created_at);
                                                            if (remaining.status === 'none') {
                                                                return <span className="text-slate-300 dark:text-slate-600">-</span>;
                                                            }

                                                            const badgeStyles = {
                                                                lifetime: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/70 dark:border-purple-800/60',
                                                                expired: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/70 dark:border-rose-800/60',
                                                                'expiring-today': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200/70 dark:border-red-800/60 animate-pulse',
                                                                urgent: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/60',
                                                                warning: 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200/70 dark:border-yellow-800/60',
                                                                active: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/60',
                                                            }[remaining.status] || 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200';

                                                            const badgeIcon = {
                                                                lifetime: 'fa-solid fa-infinity text-[8px] text-purple-500',
                                                                expired: 'fa-solid fa-circle-exclamation text-[8px] text-rose-500',
                                                                'expiring-today': 'fa-solid fa-triangle-exclamation text-[8px] text-red-500',
                                                                urgent: 'fa-solid fa-triangle-exclamation text-[8px] text-amber-500',
                                                                warning: 'fa-regular fa-clock text-[8px] text-yellow-500',
                                                                active: 'fa-regular fa-hourglass-half text-[8px] text-emerald-500',
                                                            }[remaining.status] || 'fa-regular fa-clock text-[8px] text-slate-400';

                                                            const tooltip = remaining.status === 'lifetime'
                                                                ? 'اشتراك مدى الحياة'
                                                                : `تاريخ البداية: ${remaining.startDate || '-'} | تاريخ الانتهاء: ${remaining.endDate || '-'}`;

                                                            return (
                                                                <div className="flex items-center gap-1" title={tooltip}>
                                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeStyles} whitespace-nowrap`}>
                                                                        <i className={badgeIcon}></i>
                                                                        <span>{remaining.text}</span>
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleCopy(remaining.text, `rem_${rec.id}`)}
                                                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                        title="نسخ المدة المتبقية"
                                                                    >
                                                                        <i className={`fa-solid ${copiedField === `rem_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    {/* Device Type (نوع الاشتراك: جهاز ولا جهازين) */}
                                                    {currentSheetId !== 'merchant_data' && (
                                                        <td className="px-1 py-1 font-medium">
                                                            {rec.deviceType === 'جهازين' ? (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60 shadow-xs whitespace-nowrap">
                                                                    <i className="fa-solid fa-laptop text-[8px]"></i>
                                                                    <span>جهازين</span>
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/60 shadow-xs whitespace-nowrap">
                                                                    <i className="fa-solid fa-mobile-screen text-[8px]"></i>
                                                                    <span>جهاز</span>
                                                                </span>
                                                            )}
                                                        </td>
                                                    )}
                                                    {/* Payment Status (حالة الدفع: مدفوع / غير مدفوع) */}
                                                    <td className="px-1 py-1 font-medium">
                                                        {rec.paymentStatus === 'غير مدفوع' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTogglePaymentStatus(rec.id)}
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 shadow-xs cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/60 transition whitespace-nowrap"
                                                                title="انقر لتغيير الحالة إلى مدفوع"
                                                            >
                                                                <i className="fa-solid fa-circle-xmark text-[8px] text-rose-500"></i>
                                                                <span>غير مدفوع</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTogglePaymentStatus(rec.id)}
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 shadow-xs cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition whitespace-nowrap"
                                                                title="انقر لتغيير الحالة إلى غير مدفوع"
                                                            >
                                                                <i className="fa-solid fa-circle-check text-[8px] text-emerald-500"></i>
                                                                <span>مدفوع</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </>
                                            ) : currentSheetId === 'account_data' ? (
                                                <>
                                                    {/* Account Creation Date */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {(() => {
                                                            const effectiveDate = rec.accountCreatedDate || (rec.created_at ? String(rec.created_at).slice(0, 10) : '');
                                                            if (!effectiveDate) return <span className="text-slate-300 dark:text-slate-600">-</span>;
                                                            return (
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap font-mono ${
                                                                        isSold
                                                                            ? 'bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                                                                            : isUnsold
                                                                                ? 'bg-rose-200/80 dark:bg-rose-900/60 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-700'
                                                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80'
                                                                    }`}>
                                                                        <i className="fa-regular fa-calendar text-[8px] text-purple-500"></i>
                                                                        <span>{effectiveDate}</span>
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleCopy(effectiveDate, `acd_${rec.id}`)}
                                                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                        title="نسخ تاريخ الإنشاء"
                                                                    >
                                                                        <i className={`fa-solid ${copiedField === `acd_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>

                                                    {/* Account Reminder Status */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {(() => {
                                                            const effectiveDate = rec.accountCreatedDate || (rec.created_at ? String(rec.created_at).slice(0, 10) : '');
                                                            const reminder = calculateAccountReminder(effectiveDate, rec.reminderDays, rec.created_at);
                                                            if (reminder.status === 'none') {
                                                                return <span className="text-slate-300 dark:text-slate-600">-</span>;
                                                            }
                                                            return (
                                                                <div className="flex items-center gap-1">
                                                                    <span
                                                                        title={`تاريخ الإنشاء: ${reminder.createdDate || effectiveDate || '-'} | موعد التذكير: ${reminder.targetDate || '-'} (${reminder.reminderDays || rec.reminderDays || '-'} يوم)`}
                                                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                                                            reminder.status === 'expired'
                                                                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60 shadow-xs'
                                                                                : reminder.status === 'expiring-today'
                                                                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/60 shadow-xs animate-pulse'
                                                                                : reminder.status === 'urgent'
                                                                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60 shadow-xs'
                                                                                : reminder.status === 'warning'
                                                                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/60 shadow-xs'
                                                                                : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60 shadow-xs'
                                                                        }`}
                                                                    >
                                                                        <i className={`fa-solid ${
                                                                            reminder.status === 'expired' ? 'fa-circle-xmark text-[8px] text-rose-500' :
                                                                            reminder.status === 'expiring-today' ? 'fa-bell text-[8px] text-amber-500 animate-bounce' :
                                                                            reminder.status === 'urgent' ? 'fa-triangle-exclamation text-[8px] text-rose-500' :
                                                                            reminder.status === 'warning' ? 'fa-clock text-[8px] text-amber-500' :
                                                                            'fa-bell text-[8px] text-purple-500'
                                                                        }`}></i>
                                                                        <span>{reminder.text}</span>
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleCopy(reminder.text, `rem_acc_${rec.id}`)}
                                                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 transition"
                                                                        title="نسخ حالة التذكير"
                                                                    >
                                                                        <i className={`fa-solid ${copiedField === `rem_acc_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Invoice Number */}
                                                    <td className="px-1.5 py-1">
                                                        {rec.invoiceNumber ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">
                                                                    {rec.invoiceNumber}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.invoiceNumber, `inv_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-amber-600 p-0.5"
                                                                    title="نسخ رقم الفاتورة"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `inv_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600">-</span>
                                                        )}
                                                    </td>

                                                    {/* Visa */}
                                                    <td className="px-1.5 py-1">
                                                        {rec.visa ? (
                                                            <div className="flex items-center gap-1 dir-ltr justify-end">
                                                                <span className="font-mono text-slate-800 dark:text-slate-200 select-all text-[10.5px]">
                                                                    {isVisaVisible ? rec.visa : '•••• •••• •••• ' + rec.visa.slice(-4)}
                                                                </span>
                                                                <button
                                                                    onClick={() => toggleSecret(rec.id, 'visa')}
                                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                                                                >
                                                                    <i className={`fa-solid ${isVisaVisible ? 'fa-eye-slash' : 'fa-eye'} text-[8px]`}></i>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCopy(rec.visa, `v_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `v_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Visa Account */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {rec.visaAccount ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-medium text-[10px] whitespace-nowrap">
                                                                    {rec.visaAccount}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.visaAccount, `va_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-purple-600 p-0.5"
                                                                    title="نسخ حساب الفيزا"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `va_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Account Data (بيانات الحساب) */}
                                                    <td className="px-1.5 py-1 font-medium">
                                                        {rec.selectedAccount ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60 shadow-xs whitespace-nowrap font-mono">
                                                                    <i className="fa-solid fa-shield-halved text-[8px] text-purple-500"></i>
                                                                    <span>{rec.selectedAccount}</span>
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(rec.selectedAccount, `acc_c_${rec.id}`)}
                                                                    className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 p-0.5 transition"
                                                                    title="نسخ بيانات الحساب"
                                                                >
                                                                    <i className={`fa-solid ${copiedField === `acc_c_${rec.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-[8px]`}></i>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                                </>
                                            )}

                                            {/* Actions */}
                                            <td className={`px-1 py-1 text-center ${currentSheetId === 'account_data' ? 'min-w-[115px]' : 'min-w-[56px]'} sticky left-0 z-10 ${stickyActionBgClass} shadow-[-3px_0_6px_rgba(0,0,0,0.06)] border-r ${isGreen ? 'border-emerald-200/80 dark:border-emerald-800/80' : isRed ? 'border-rose-200/80 dark:border-rose-800/80' : 'border-slate-100 dark:border-slate-800'}`}>
                                                {isTrashSheet ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => handleRestoreRecord(rec)}
                                                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 rounded text-[10px] font-bold flex items-center gap-1 transition shadow-xs whitespace-nowrap"
                                                            title="استرداد السجل إلى شيته الأصلي"
                                                        >
                                                            <i className="fa-solid fa-rotate-left text-[8px]"></i>
                                                            <span>استرداد</span>
                                                        </button>
                                                        {canEmptyTrash && (
                                                            <button
                                                                onClick={() => handleDeleteRecord(rec.id)}
                                                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                                                title="حذف نهائي"
                                                            >
                                                                <i className="fa-solid fa-trash text-[8.5px]"></i>
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1">
                                                        {/* زر حالة البيع والتظليل: خاص ببيانات الحساب فقط بين النسخ والتعديل */}
                                                        {currentSheetId === 'account_data' && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const menuHeight = 175;
                                                                    const menuWidth = 190;
                                                                    const spaceBelow = window.innerHeight - rect.bottom;
                                                                    const openUpwards = spaceBelow < menuHeight;
                                                                    const top = openUpwards ? Math.max(10, rect.top - menuHeight - 4) : rect.bottom + 4;
                                                                    const left = Math.min(Math.max(10, rect.left), window.innerWidth - menuWidth - 10);

                                                                    setSaleMenuAnchor(prev => (prev?.id === rec.id ? null : {
                                                                        id: rec.id,
                                                                        top,
                                                                        left,
                                                                        saleStatus: rec.saleStatus,
                                                                        isSold: rec.isSold
                                                                    }));
                                                                }}
                                                                title="تحديد حالة البيع والتظليل (انقر لفتح الاختيارات)"
                                                                className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shadow-xs ${
                                                                    isSold
                                                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                                                                        : isUnsold
                                                                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
                                                                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-400 border border-slate-300/80 dark:border-slate-700'
                                                                }`}
                                                            >
                                                                {isSold ? (
                                                                    <>
                                                                        <i className="fa-solid fa-check text-[7.5px]"></i>
                                                                        <span>تم البيع</span>
                                                                        <i className="fa-solid fa-caret-down text-[7px] opacity-75"></i>
                                                                    </>
                                                                ) : isUnsold ? (
                                                                    <>
                                                                        <i className="fa-solid fa-xmark text-[7.5px]"></i>
                                                                        <span>لم يتم</span>
                                                                        <i className="fa-solid fa-caret-down text-[7px] opacity-75"></i>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <i className="fa-solid fa-tag text-[7.5px]"></i>
                                                                        <span>الحالة</span>
                                                                        <i className="fa-solid fa-caret-down text-[7px] opacity-75"></i>
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}

                                                        {canEdit && (
                                                            <button
                                                                onClick={() => handleOpenEdit(rec)}
                                                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                                                title="تعديل"
                                                            >
                                                                <i className="fa-solid fa-pen text-[8.5px]"></i>
                                                            </button>
                                                        )}
                                                        {canDelete && (
                                                            <button
                                                                onClick={() => handleDeleteRecord(rec.id)}
                                                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                                                title="حذف ونقل إلى سلة المهملات"
                                                            >
                                                                <i className="fa-solid fa-trash text-[8.5px]"></i>
                                                            </button>
                                                        )}
                                                        {!canEdit && !canDelete && (
                                                            <span className="text-[9px] text-slate-400">عرض فقط</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {pageSize !== 'all' && totalPages > 1 && (
                    <div className="p-4 bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                            عرض الصفحة <b className="text-slate-800 dark:text-white">{currentPage}</b> من أصل <b className="text-slate-800 dark:text-white">{totalPages}</b> (إجمالي {filteredRecords.length} سجل)
                        </span>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                                <i className="fa-solid fa-angles-right"></i>
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 font-bold"
                            >
                                السابق
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 font-bold"
                            >
                                التالي
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                                <i className="fa-solid fa-angles-left"></i>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal: Add / Edit Single Record */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full max-h-[90vh] sm:max-h-[88vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                        {/* Fixed Header with Title and Cancel/Close Button */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${currentSheet.color} text-white flex items-center justify-center text-lg shadow-sm`}>
                                    <i className={`fa-solid ${editingRecord ? 'fa-pen-to-square' : 'fa-plus'}`}></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-slate-800 dark:text-white leading-tight">
                                        {editingRecord ? 'تعديل السجل' : 'إضافة بيان جديد'}
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        الشيت الحالي: <span className="font-bold text-indigo-600 dark:text-indigo-400">{currentSheet.name}</span>
                                    </p>
                                </div>
                            </div>
                            {/* Prominent Cancel / Close Button (علامة الإلغاء) */}
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                title="إلغاء وإغلاق النافذة"
                                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition border border-slate-200/60 dark:border-slate-700/60 hover:border-rose-300 dark:hover:border-rose-800/80 shadow-xs cursor-pointer group"
                            >
                                <i className="fa-solid fa-xmark text-base group-hover:scale-110 transition-transform"></i>
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0">
                            {/* Scrollable Form Body with visible scrollbar on the left side */}
                            <div className="flex-1 overflow-y-auto custom-modal-scroll px-6 py-5 space-y-4">
                            {isCustomersSheet ? (
                                <div className="space-y-4">
                                    {/* Name */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            اسم العميل <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <i className="fa-solid fa-user absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="أدخل اسم العميل بالكامل..."
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            رقم التليفون <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <i className="fa-solid fa-phone absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                            <input
                                                type="tel"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                placeholder="مثال: 01012345678 أو +20..."
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dir-ltr text-right font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* Subscription Type */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            نوع الاشتراك
                                        </label>
                                        <div className="relative">
                                            <i className="fa-solid fa-tag absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                            <input
                                                type="text"
                                                value={formData.deviceType}
                                                onChange={(e) => setFormData({ ...formData, deviceType: e.target.value })}
                                                placeholder="مثال: سنوي، شهري، VIP، أو أي نوع اشتراك..."
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                            {/* Email */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    البريد الإلكتروني (Email)
                                </label>
                                <div className="relative">
                                    <i className="fa-solid fa-envelope absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                    <input
                                        type="text"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="example@domain.com"
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dir-ltr text-right"
                                    />
                                </div>
                            </div>

                            {/* Passwords (Grid of 2) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                        {isClientOrMerchant ? 'الباسورد الأول (كلمة المرور 1)' : 'كلمة المرور 1 (Password)'}
                                    </label>
                                    <div className="relative">
                                        <i className="fa-solid fa-lock absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                        <input
                                            type="text"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="كلمة المرور الرئيسية"
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dir-ltr text-right"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                        {isClientOrMerchant ? 'الباسورد الثاني (كلمة المرور 2)' : 'كلمة المرور 2 (Password 2)'}
                                    </label>
                                    <div className="relative">
                                        <i className="fa-solid fa-key absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                        <input
                                            type="text"
                                            value={formData.password2}
                                            onChange={(e) => setFormData({ ...formData, password2: e.target.value })}
                                            placeholder="كلمة مرور بديلة / كود إضافي"
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dir-ltr text-right"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Duration & Start Date & Service Type (for Client / Merchant) */}
                            {isClientOrMerchant && (
                                <>
                                {/* اسم التاجر (كتابة يدوية) أو نوع الخدمة (قائمة منسدلة) */}
                                {currentSheetId === 'merchant_data' ? (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                                اسم التاجر
                                            </label>
                                            <span className="text-[11px] text-slate-400">
                                                (Merchant Name)
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <i className="fa-solid fa-store absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                            <input
                                                type="text"
                                                value={formData.serviceType}
                                                onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                                                placeholder="أدخل اسم التاجر..."
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5" ref={serviceDropdownRef}>
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                                الخدمة / السيرفر
                                            </label>
                                            <span className="text-[11px] text-slate-400">
                                                (Private / Service VIP / Z Y N O R A)
                                            </span>
                                        </div>

                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setIsServiceDropdownOpen(prev => !prev)}
                                                className={`w-full bg-white dark:bg-slate-850 border-2 ${
                                                    isServiceDropdownOpen
                                                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                                                        : formData.serviceType
                                                        ? 'border-indigo-400 dark:border-indigo-500 shadow-xs'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                                                } rounded-2xl px-3.5 py-2.5 flex items-center justify-between transition cursor-pointer select-none`}
                                            >
                                                {/* سهم القائمة المنسدلة (Chevron Arrow on Left) */}
                                                <div className="w-5 h-5 flex items-center justify-center text-slate-700 dark:text-slate-300">
                                                    <i className={`fa-solid fa-chevron-down text-xs transition-transform duration-200 ${isServiceDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`}></i>
                                                </div>

                                                {/* الخيار المختار على اليمين */}
                                                <div className="flex items-center gap-2">
                                                    {formData.serviceType ? (
                                                        (() => {
                                                            const opt = SERVICE_TYPE_OPTIONS.find(o => o.value === formData.serviceType);
                                                            return (
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black border ${opt?.badge || 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                                                    <i className={`${opt?.icon || 'fa-solid fa-tag'} text-xs`}></i>
                                                                    <span>{formData.serviceType}</span>
                                                                </span>
                                                            );
                                                        })()
                                                    ) : (
                                                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                                                            <i className="fa-solid fa-layer-group text-slate-300 dark:text-slate-600"></i>
                                                            <span>اختر الخدمة (Private / Service VIP / Z Y N O R A)</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </button>

                                            {/* Dropdown Menu */}
                                            {isServiceDropdownOpen && (
                                                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-40 animate-fade-in divide-y divide-slate-100 dark:divide-slate-800">
                                                    {formData.serviceType && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFormData({ ...formData, serviceType: '' });
                                                                setIsServiceDropdownOpen(false);
                                                            }}
                                                            className="w-full px-4 py-2.5 flex items-center justify-between transition text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
                                                        >
                                                            <span>إلغاء التحديد (بدون خدمة)</span>
                                                            <i className="fa-solid fa-xmark"></i>
                                                        </button>
                                                    )}
                                                    {SERVICE_TYPE_OPTIONS.map(opt => {
                                                        const isSelected = formData.serviceType === opt.value;
                                                        return (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, serviceType: opt.value });
                                                                    setIsServiceDropdownOpen(false);
                                                                }}
                                                                className={`w-full px-4 py-3 flex items-center justify-between transition text-xs font-bold cursor-pointer ${
                                                                    isSelected
                                                                        ? 'bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${isSelected ? 'bg-indigo-600 text-white text-[9px]' : 'border border-slate-300 dark:border-slate-600'}`}>
                                                                        {isSelected && <i className="fa-solid fa-check"></i>}
                                                                    </div>
                                                                    <span className="text-sm font-black">{opt.label}</span>
                                                                </div>
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${opt.badge}`}>
                                                                    <i className={opt.icon}></i>
                                                                    <span>{opt.label}</span>
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Duration (Custom Dropdown matching design) */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                                مدة الاشتراك
                                            </label>
                                            <span className="text-[11px] text-slate-400">
                                                (Subscription Duration)
                                            </span>
                                        </div>

                                        <div className="relative" ref={durationDropdownRef}>
                                            {/* Dropdown Trigger matching the design */}
                                            <button
                                                type="button"
                                                onClick={() => setIsDurationDropdownOpen(prev => !prev)}
                                                className={`w-full bg-white dark:bg-slate-850 border-2 ${
                                                    isDurationDropdownOpen
                                                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                                                        : 'border-blue-400 dark:border-blue-500 hover:border-blue-500'
                                                } rounded-2xl px-3.5 py-2.5 flex items-center justify-between transition cursor-pointer select-none`}
                                            >
                                                {/* Chevron Arrow on Left */}
                                                <div className="w-5 h-5 flex items-center justify-center text-slate-700 dark:text-slate-300">
                                                    <i className={`fa-solid fa-chevron-down text-xs transition-transform duration-200 ${isDurationDropdownOpen ? 'rotate-180 text-blue-600' : ''}`}></i>
                                                </div>

                                                {/* Label + Calendar Icon on Right */}
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-bold ${formData.duration ? 'text-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        {formData.duration || 'اختر مدة الاشتراك'}
                                                    </span>
                                                    <CalendarOptionIcon
                                                        num={formData.duration ? parseInt(formData.duration) : null}
                                                        isSelected={true}
                                                    />
                                                </div>
                                            </button>

                                            {/* Dropdown Menu matching user image */}
                                            {isDurationDropdownOpen && (
                                                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-40 animate-fade-in divide-y divide-slate-100 dark:divide-slate-800">
                                                    {/* Default Option (placeholder) */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, duration: '' });
                                                            setIsDurationDropdownOpen(false);
                                                        }}
                                                        className={`w-full px-4 py-3 flex items-center justify-end gap-2.5 transition text-xs font-bold ${
                                                            !formData.duration
                                                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        <span>اختر مدة الاشتراك (من شهر إلى 6 شهور)</span>
                                                        <CalendarOptionIcon num={null} isSelected={!formData.duration} />
                                                    </button>

                                                    {/* Options from 1 to 6 months */}
                                                    {DURATION_ITEMS.map(item => {
                                                        const isSelected = formData.duration === item.value;
                                                        return (
                                                            <button
                                                                key={item.value}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, duration: item.value });
                                                                    setIsDurationDropdownOpen(false);
                                                                }}
                                                                className={`w-full px-4 py-3 flex items-center justify-end gap-3 transition text-xs font-bold ${
                                                                    isSelected
                                                                        ? 'bg-blue-50/80 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <span className="text-sm font-bold">{item.label}</span>
                                                                <CalendarOptionIcon num={item.num} isSelected={isSelected} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Start Date (تاريخ بداية الاشتراك) */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                                تاريخ بداية الاشتراك
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, startDate: new Date().toISOString().slice(0, 10) })}
                                                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
                                                title="تعيين لتاريخ اليوم"
                                            >
                                                اليوم
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <input
                                                type="date"
                                                value={formData.startDate}
                                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                                className="w-full bg-white dark:bg-slate-850 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 focus:border-blue-500 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* نوع الاشتراك: جهاز ولا جهازين (خاص ببيانات العميل فقط) */}
                                {currentSheetId !== 'merchant_data' && (
                                    <div className="space-y-1.5 pt-1">
                                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                            نوع الاشتراك
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, deviceType: 'جهاز' })}
                                                className={`py-2.5 px-4 rounded-2xl border-2 text-xs font-bold flex items-center justify-center gap-2.5 transition select-none cursor-pointer ${
                                                    formData.deviceType === 'جهاز' || !formData.deviceType
                                                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm ring-2 ring-blue-500/20'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-850'
                                                }`}
                                            >
                                                <i className="fa-solid fa-mobile-screen text-base text-blue-500"></i>
                                                <span className="text-sm">جهاز</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, deviceType: 'جهازين' })}
                                                className={`py-2.5 px-4 rounded-2xl border-2 text-xs font-bold flex items-center justify-center gap-2.5 transition select-none cursor-pointer ${
                                                    formData.deviceType === 'جهازين'
                                                        ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-sm ring-2 ring-purple-500/20'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-850'
                                                }`}
                                            >
                                                <i className="fa-solid fa-laptop text-base text-purple-500"></i>
                                                <span className="text-sm">جهازين</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* حالة الدفع: مدفوع ولا غير مدفوع */}
                                <div className="space-y-1.5 pt-1">
                                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                        حالة الدفع
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, paymentStatus: 'مدفوع' })}
                                            className={`py-2.5 px-4 rounded-2xl border-2 text-xs font-bold flex items-center justify-center gap-2.5 transition select-none cursor-pointer ${
                                                formData.paymentStatus === 'مدفوع' || !formData.paymentStatus
                                                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm ring-2 ring-emerald-500/20'
                                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-850'
                                            }`}
                                        >
                                            <i className="fa-solid fa-circle-check text-base text-emerald-500"></i>
                                            <span className="text-sm">مدفوع</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, paymentStatus: 'غير مدفوع' })}
                                            className={`py-2.5 px-4 rounded-2xl border-2 text-xs font-bold flex items-center justify-center gap-2.5 transition select-none cursor-pointer ${
                                                formData.paymentStatus === 'غير مدفوع'
                                                    ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm ring-2 ring-rose-500/20'
                                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-850'
                                            }`}
                                        >
                                            <i className="fa-solid fa-circle-xmark text-base text-rose-500"></i>
                                            <span className="text-sm">غير مدفوع</span>
                                        </button>
                                    </div>
                                </div>
                                </>
                            )}

                            {/* Specifically for Account Data Sheet: Account Creation Date & Reminder Period */}
                            {currentSheetId === 'account_data' && (
                                <div className="p-3.5 bg-purple-50/60 dark:bg-purple-950/30 rounded-2xl border border-purple-200/70 dark:border-purple-800/50 space-y-3">
                                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-xs">
                                        <i className="fa-solid fa-clock-rotate-left text-sm"></i>
                                        <span>بيانات التذكير وتاريخ إنشاء الحساب</span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Creation Date */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                    تاريخ إنشاء الحساب
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, accountCreatedDate: new Date().toISOString().slice(0, 10) })}
                                                    className="text-[10px] font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400 bg-purple-100/80 dark:bg-purple-900/60 px-2 py-0.5 rounded-md transition"
                                                >
                                                    اليوم
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="date"
                                                    value={formData.accountCreatedDate}
                                                    onChange={(e) => setFormData({ ...formData, accountCreatedDate: e.target.value })}
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                                />
                                            </div>
                                        </div>

                                        {/* Reminder Days */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                                فترة التذكير (عدد الأيام)
                                            </label>
                                            <div className="relative">
                                                <i className="fa-solid fa-bell absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="3650"
                                                    value={formData.reminderDays}
                                                    onChange={(e) => setFormData({ ...formData, reminderDays: e.target.value })}
                                                    placeholder="مثال: 30"
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick chips for reminder days */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                        <span className="text-[10.5px] text-slate-400 font-bold ml-1">خيارات سريعة:</span>
                                        {[15, 30, 45, 60, 90].map(days => (
                                            <button
                                                key={days}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, reminderDays: String(days) })}
                                                className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold transition ${
                                                    String(formData.reminderDays) === String(days)
                                                        ? 'bg-purple-600 text-white shadow-xs'
                                                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-slate-750'
                                                }`}
                                            >
                                                {days} يوم
                                            </button>
                                        ))}
                                    </div>

                                    {/* Live calculation info box */}
                                    {formData.accountCreatedDate && formData.reminderDays && parseInt(formData.reminderDays) > 0 && (() => {
                                        const reminderPreview = calculateAccountReminder(formData.accountCreatedDate, formData.reminderDays);
                                        if (reminderPreview.status === 'none') return null;
                                        return (
                                            <div className="mt-1.5 p-2 rounded-xl bg-purple-100/70 dark:bg-purple-900/40 border border-purple-200/90 dark:border-purple-800/70 flex items-center justify-between text-xs text-purple-950 dark:text-purple-200">
                                                <div className="flex items-center gap-2">
                                                    <i className="fa-solid fa-calendar-check text-purple-600 dark:text-purple-400"></i>
                                                    <span>موعد التذكير: <strong>{reminderPreview.targetDate}</strong></span>
                                                </div>
                                                <span className="font-bold px-2 py-0.5 rounded-md bg-purple-200/80 dark:bg-purple-800/90 text-[10.5px]">
                                                    {reminderPreview.text}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Invoice & Visa (for Invoice Sheet & Account Sheet - hidden in main table for Account sheet) */}
                            {!isClientOrMerchant && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                                كود الفاتورة (Invoice Code)
                                            </label>
                                            <div className="relative">
                                                <i className="fa-solid fa-file-invoice absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                                <input
                                                    type="text"
                                                    value={formData.invoiceNumber}
                                                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                                                    placeholder="مثال: INV-100234"
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                                الفيزا / رقم البطاقة (Visa)
                                            </label>
                                            <div className="relative">
                                                <i className="fa-solid fa-credit-card absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                                <input
                                                    type="text"
                                                    value={formData.visa}
                                                    onChange={(e) => setFormData({ ...formData, visa: e.target.value })}
                                                    placeholder="4111 2222 3333 4444"
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dir-ltr text-right"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            حساب الفيزا (Visa Account / Bank)
                                        </label>
                                        <div className="relative">
                                            <i className="fa-solid fa-building-columns absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                            <input
                                                type="text"
                                                value={formData.visaAccount}
                                                onChange={(e) => setFormData({ ...formData, visaAccount: e.target.value })}
                                                placeholder="اسم البنك، المحفظة، أو صاحب الحساب"
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* حالة البيع والتظليل: خاص ببيانات الحساب فقط */}
                            {currentSheetId === 'account_data' && (
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        حالة البيع والتظليل في الجدول
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, saleStatus: '' })}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                !formData.saleStatus
                                                    ? 'bg-slate-200 dark:bg-slate-700 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-white shadow-xs'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750'
                                            }`}
                                        >
                                            <i className="fa-solid fa-minus text-[10px]"></i>
                                            <span>بدون تظليل</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, saleStatus: 'sold' })}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                formData.saleStatus === 'sold'
                                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                                                    : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100'
                                            }`}
                                        >
                                            <i className="fa-solid fa-circle-check text-xs"></i>
                                            <span>تم البيع (أخضر)</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, saleStatus: 'unsold' })}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                formData.saleStatus === 'unsold'
                                                    ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                                                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100'
                                            }`}
                                        >
                                            <i className="fa-solid fa-circle-xmark text-xs"></i>
                                            <span>لم يتم (أحمر)</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                                </>
                            )}

                            {/* Notes Field (Directly under duration / visa for all sheets) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    ملاحظات إضافية
                                </label>
                                <textarea
                                    rows={2}
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="أي تفاصيل أو ملاحظات إضافية..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                                />
                            </div>

                            </div>

                            {/* Fixed Footer with Cancel and Submit buttons */}
                            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 backdrop-blur-xs flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                                >
                                    <i className="fa-solid fa-xmark text-slate-400 text-xs"></i>
                                    <span>إلغاء</span>
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <i className="fa-solid fa-check text-xs"></i>
                                    <span>{editingRecord ? 'حفظ التعديلات' : 'إضافة السجل'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Bulk Add */}
            {showBulkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center text-lg">
                                    <i className="fa-solid fa-layer-group"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-slate-800 dark:text-white">إضافة مجمعة سريعة</h3>
                                    <p className="text-xs text-slate-400">إضافة عدة أسطر دفعة واحدة إلى <b className="text-indigo-500">{currentSheet.name}</b></p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowBulkModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl text-xs text-slate-600 dark:text-slate-400 space-y-1">
                            <p className="font-bold text-slate-800 dark:text-slate-200">الصيغ المدعومة لكل سطر (مفصولة بـ : أو | أو Tab):</p>
                            {isCustomersSheet ? (
                                <>
                                    <p className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
                                        الاسم:رقم الهاتف:نوع الاشتراك:ملاحظات
                                    </p>
                                    <p className="text-[11px] text-slate-400">مثال: أحمد محمد:01012345678:جهاز:عميل مميز</p>
                                </>
                            ) : isClientOrMerchant ? (
                                <>
                                    <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                                        email:pass1:pass2:duration:notes
                                    </p>
                                    <p className="text-[11px] text-slate-400">مثال: user@mail.com:Pass123:PassAlt:1 شهر:عميل مميز</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                                        email:pass:pass2:invoice:visa:visaAccount:notes
                                    </p>
                                    <p className="text-[11px] text-slate-400">مثال: user@mail.com:Pass123:PassAlt:INV-99:4111222233334444:CIB Bank:عميل مميز</p>
                                </>
                            )}
                        </div>

                        <form onSubmit={handleBulkAddSubmit} className="space-y-4">
                            <textarea
                                rows={8}
                                value={bulkText}
                                onChange={(e) => setBulkText(e.target.value)}
                                placeholder="الصق البيانات هنا، كل سطر يمثل سجلاً منفصلاً..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 dir-ltr text-left"
                            />

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-xs text-slate-400">
                                    عدد الأسطر: <b className="text-slate-700 dark:text-slate-200">{bulkText.split('\n').filter(l => l.trim()).length}</b>
                                </span>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkModal(false)}
                                        className="px-5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition transform active:scale-95"
                                    >
                                        إضافة السجلات
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Rename Sheet */}
            {showRenameModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-base text-slate-800 dark:text-white">تعديل اسم الشيت</h3>
                            <button
                                onClick={() => setShowRenameModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form onSubmit={handleRenameSheet} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    اسم الشيت الجديد
                                </label>
                                <input
                                    type="text"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    placeholder="أدخل اسم الشيت"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowRenameModal(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition"
                                >
                                    حفظ الاسم
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Data Repair & Builder (إصلاح وتحديث وبناء البيانات التالفة) */}
            {showRepairModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg shadow-lg shadow-amber-500/30">
                                    <i className="fa-solid fa-screwdriver-wrench"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-slate-800 dark:text-white">
                                        إصلاح وبناء وتحديث البيانات
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        معالجة البيانات التالفة وتوليد بيانات نموذجية جاهزة للعمل فوراً
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowRepairModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        {/* Status Card */}
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">حالة نظام البيانات:</span>
                                <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                                    <i className="fa-solid fa-shield-halved"></i>
                                    الحماية الذاتية مفعلة (Zero Crashes)
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                يتم فحص وتنظيف البيانات تلقائياً لمنع أي تعطل للشاشة، ويمكنك استخدام الأدوات التالية لمعالجة أي شيت متضرر أو تعبئته بسجلات جديدة.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {/* Option 1: Scan & Repair */}
                            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 bg-slate-50/50 dark:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                                        <i className="fa-solid fa-wand-magic-sparkles text-indigo-500"></i>
                                        فحص وإصلاح البيانات الحالية
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        فحص جميع الشيتات وتصحيح التنسيقات غير المتوافقة دون حذف بياناتك القائمة.
                                    </p>
                                </div>
                                <button
                                    onClick={handleScanAndRepair}
                                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-600/20 whitespace-nowrap self-end sm:self-center"
                                >
                                    فحص وإصلاح الآن
                                </button>
                            </div>

                            {/* Option 2: Build Sample Data */}
                            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 bg-slate-50/50 dark:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                                        <i className="fa-solid fa-database text-emerald-500"></i>
                                        بناء وتوليد بيانات نموذجية واقعية
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        إنشاء سجلات اشتراكات واقعية كاملة لجميع الشيتات الأربعة (عملاء، تجار، حسابات، وفواتير).
                                    </p>
                                </div>
                                <button
                                    onClick={handleBuildSampleData}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20 whitespace-nowrap self-end sm:self-center"
                                >
                                    توليد بيانات نموذجية
                                </button>
                            </div>

                            {/* Option 3: Clean Reset */}
                            <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <h4 className="font-bold text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                                        <i className="fa-solid fa-trash-can"></i>
                                        إعادة تهيئة وتفريغ الشيتات
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        مسح كافة السجلات الحالية للبدء من الصفر بشيتات نظيفة وفارغة تماماً.
                                    </p>
                                </div>
                                <button
                                    onClick={handleResetClean}
                                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition whitespace-nowrap self-end sm:self-center"
                                >
                                    تفريغ الشيتات
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setShowRepairModal(false)}
                                className="px-5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition"
                            >
                                إغلاق النافذة
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sale Status Floating Menu (Fixed Portal to avoid any table overflow clipping - Only for account_data) */}
            {saleMenuAnchor && currentSheetId === 'account_data' && (
                <div
                    className="fixed inset-0 z-[99999]"
                    onClick={() => setSaleMenuAnchor(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'fixed',
                            top: `${saleMenuAnchor.top}px`,
                            left: `${saleMenuAnchor.left}px`,
                            width: '190px'
                        }}
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1 z-[99999] animate-fade-in text-right divide-y divide-slate-100 dark:divide-slate-800 ring-1 ring-black/5"
                    >
                        <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between">
                            <span>حالة البيع والتظليل:</span>
                            <button
                                type="button"
                                onClick={() => setSaleMenuAnchor(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                            >
                                <i className="fa-solid fa-xmark text-[9px]"></i>
                            </button>
                        </div>

                        <div className="p-1 space-y-1">
                            {/* خيار 1: تم البيع */}
                            <button
                                type="button"
                                onClick={() => {
                                    handleSetSaleStatus(saleMenuAnchor.id, 'sold');
                                    setSaleMenuAnchor(null);
                                }}
                                className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-xs font-bold transition hover:bg-emerald-50 dark:hover:bg-emerald-950/50 cursor-pointer ${
                                    saleMenuAnchor.saleStatus === 'sold' || saleMenuAnchor.isSold === true
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                        : 'text-slate-700 dark:text-slate-200'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <i className={`fa-solid fa-circle-check text-xs ${
                                        saleMenuAnchor.saleStatus === 'sold' || saleMenuAnchor.isSold === true ? 'text-white' : 'text-emerald-500'
                                    }`}></i>
                                    <span>تم البيع</span>
                                </span>
                                <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold ${
                                    saleMenuAnchor.saleStatus === 'sold' || saleMenuAnchor.isSold === true
                                        ? 'bg-white/25 text-white'
                                        : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                                }`}>
                                    أخضر فاتح
                                </span>
                            </button>

                            {/* خيار 2: لم يتم البيع */}
                            <button
                                type="button"
                                onClick={() => {
                                    handleSetSaleStatus(saleMenuAnchor.id, 'unsold');
                                    setSaleMenuAnchor(null);
                                }}
                                className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-xs font-bold transition hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer ${
                                    saleMenuAnchor.saleStatus === 'unsold' || saleMenuAnchor.isSold === false
                                        ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
                                        : 'text-slate-700 dark:text-slate-200'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <i className={`fa-solid fa-circle-xmark text-xs ${
                                        saleMenuAnchor.saleStatus === 'unsold' || saleMenuAnchor.isSold === false ? 'text-white' : 'text-rose-500'
                                    }`}></i>
                                    <span>لم يتم البيع</span>
                                </span>
                                <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold ${
                                    saleMenuAnchor.saleStatus === 'unsold' || saleMenuAnchor.isSold === false
                                        ? 'bg-white/25 text-white'
                                        : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200'
                                }`}>
                                    أحمر فاتح
                                </span>
                            </button>

                            {/* خيار 3: إلغاء التظليل */}
                            <button
                                type="button"
                                onClick={() => {
                                    handleSetSaleStatus(saleMenuAnchor.id, null);
                                    setSaleMenuAnchor(null);
                                }}
                                className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-xs font-bold transition hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                                    !saleMenuAnchor.saleStatus && (saleMenuAnchor.isSold === null || saleMenuAnchor.isSold === undefined)
                                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white'
                                        : 'text-slate-600 dark:text-slate-400'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <i className="fa-solid fa-ban text-xs text-slate-400"></i>
                                    <span>إلغاء التظليل</span>
                                </span>
                                <span className="text-[8.5px] px-1.5 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    عادي
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
