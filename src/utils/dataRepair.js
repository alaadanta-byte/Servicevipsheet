// Helper utilities for data sanitization, auto-healing, and realistic sample data generation

export const STORAGE_PREFIX = 'sv_custom_sheet_';

export const DEFAULT_SHEETS = [
    { id: 'client_data', name: 'بيانات العميل', icon: 'fa-user-tie', color: 'from-blue-600 to-indigo-600', badgeColor: 'bg-blue-500' },
    { id: 'merchant_data', name: 'بيانات التاجر', icon: 'fa-store', color: 'from-emerald-600 to-teal-600', badgeColor: 'bg-emerald-500' },
    { id: 'account_data', name: 'بيانات الحساب', icon: 'fa-shield-halved', color: 'from-purple-600 to-indigo-600', badgeColor: 'bg-purple-500' },
    { id: 'trash_data', name: 'سلة المهملات', icon: 'fa-trash-can', color: 'from-rose-600 to-red-600', badgeColor: 'bg-rose-500' }
];

/**
 * Sanitize an individual record so that no field can ever cause a TypeError
 * (e.g. from calling .toLowerCase(), .slice(), etc. on null, undefined, or numbers)
 */
export const sanitizeRecord = (r, idx = 0) => {
    if (!r || typeof r !== 'object') return null;

    // Handle excel or legacy keys
    const rawInvoice = r.invoiceNumber ?? r.invoice ?? r['رقم الفاتورة'] ?? r['الفاتورة'] ?? '';
    const rawName = r.name ?? r['اسم العميل'] ?? r['العميل'] ?? '';
    const rawPhone = r.phone ?? r['رقم الهاتف'] ?? r['الهاتف'] ?? r['موبايل'] ?? '';
    const rawEmail = r.email ?? r['البريد الإلكتروني'] ?? r['الإيميل'] ?? '';
    const rawPassword = r.password ?? r['الباسورد'] ?? r['كلمة المرور'] ?? r['الباسورد الأول'] ?? '';
    const rawPassword2 = r.password2 ?? r['الباسورد الثاني'] ?? r['كلمة المرور 2'] ?? r['الباسورد البديل'] ?? '';
    const rawDuration = r.duration ?? r['مدة الاشتراك'] ?? r['المدة'] ?? '';
    const rawStartDate = r.startDate ?? r.date ?? r['تاريخ البداية'] ?? r['تاريخ بداية الاشتراك'] ?? r['تاريخ الاشتراك'] ?? '';
    const rawDeviceType = r.deviceType ?? r['نوع الاشتراك'] ?? r['الأجهزة'] ?? r['الجهاز'] ?? '';
    const rawPaymentStatus = r.paymentStatus ?? r['حالة الدفع'] ?? r['الدفع'] ?? r.paymentState ?? '';
    const rawVisa = r.visa ?? r['الفيزا'] ?? r['رقم البطاقة'] ?? r['البطاقة'] ?? '';
    const rawVisaAccount = r.visaAccount ?? r['حساب الفيزا'] ?? r['البنك'] ?? r['اسم البنك'] ?? '';
    const rawAccountCreatedDate = r.accountCreatedDate ?? r['تاريخ انشاء الحساب'] ?? r['تاريخ إنشاء الحساب'] ?? r['تاريخ الإنشاء'] ?? '';
    const rawReminderDays = r.reminderDays ?? r['فترة التذكير'] ?? r['فترة تذكارية'] ?? r['التذكير'] ?? r['ايام التذكير'] ?? '';
    const rawSelectedAccount = r.selectedAccount ?? r['بيانات الحساب'] ?? r.accountData ?? r['الحساب'] ?? r['اسم الحساب'] ?? '';
    
    let finalAccountCreatedDate = String(rawAccountCreatedDate || '').trim();
    let finalReminderDays = String(rawReminderDays || '').trim();

    // Smart fallback for existing accounts in localStorage
    if (!finalAccountCreatedDate) {
        if (r.id === 'REC-ACC-301') {
            finalAccountCreatedDate = '2026-08-10';
            if (!finalReminderDays) finalReminderDays = '30';
        } else if (r.id === 'REC-ACC-302') {
            finalAccountCreatedDate = '2026-08-01';
            if (!finalReminderDays) finalReminderDays = '30';
        } else if (r.id === 'REC-ACC-303') {
            finalAccountCreatedDate = '2026-08-25';
            if (!finalReminderDays) finalReminderDays = '15';
        } else if (r.id === 'REC-ACC-304') {
            finalAccountCreatedDate = '2026-09-01';
            if (!finalReminderDays) finalReminderDays = '60';
        } else if (r.startDate) {
            finalAccountCreatedDate = String(r.startDate).trim();
        } else if (r.created_at) {
            finalAccountCreatedDate = String(r.created_at).slice(0, 10);
        }
    }
    if (!finalReminderDays && (r.id?.startsWith('REC-ACC-') || finalAccountCreatedDate)) {
        finalReminderDays = '30';
    }

    // Assemble notes, appending phone/name if they existed separately
    let rawNotes = r.notes ?? r['ملاحظات'] ?? '';
    const extras = [];
    if (rawName && !String(rawNotes).includes(String(rawName))) extras.push(`العميل: ${rawName}`);
    if (rawPhone && !String(rawNotes).includes(String(rawPhone))) extras.push(`الهاتف: ${rawPhone}`);
    if (extras.length > 0) {
        rawNotes = rawNotes ? `${rawNotes} | ${extras.join(' - ')}` : extras.join(' - ');
    }

    return {
        id: String(r.id || `REC-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`),
        email: String(rawEmail).trim(),
        password: String(rawPassword).trim(),
        password2: String(rawPassword2).trim(),
        duration: String(rawDuration).trim(),
        startDate: String(rawStartDate).trim(),
        deviceType: String(rawDeviceType).trim(),
        paymentStatus: String(rawPaymentStatus).trim() === 'غير مدفوع' ? 'غير مدفوع' : 'مدفوع',
        selectedAccount: String(rawSelectedAccount || '').trim(),
        invoiceNumber: String(rawInvoice).trim(),
        visa: String(rawVisa).trim(),
        visaAccount: String(rawVisaAccount).trim(),
        accountCreatedDate: finalAccountCreatedDate,
        reminderDays: finalReminderDays,
        notes: String(rawNotes).trim(),
        deletedAt: r.deletedAt ? String(r.deletedAt) : '',
        originSheetId: r.originSheetId ? String(r.originSheetId) : '',
        originSheetName: r.originSheetName ? String(r.originSheetName) : '',
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString()
    };
};

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

/**
 * Calculates reminder status for account records based on creation date and reminder days.
 */
export const calculateAccountReminder = (rawCreatedDate, rawReminderDays, rawCreatedAt) => {
    const reminderDays = parseInt(rawReminderDays);
    const effectiveDateStr = rawCreatedDate || (rawCreatedAt ? String(rawCreatedAt).slice(0, 10) : '');

    if (!effectiveDateStr && isNaN(reminderDays)) {
        return { text: '-', status: 'none', days: null, targetDate: '' };
    }

    if (isNaN(reminderDays) || reminderDays <= 0) {
        return { text: 'بدون تذكير', status: 'none', days: null, targetDate: '', createdDate: effectiveDateStr };
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
        return { text: '-', status: 'none', days: null, targetDate: '' };
    }

    const target = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    target.setDate(target.getDate() + reminderDays);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const ty = target.getFullYear();
    const tm = String(target.getMonth() + 1).padStart(2, '0');
    const td = String(target.getDate()).padStart(2, '0');
    const targetFormatted = `${ty}-${tm}-${td}`;

    const sy = start.getFullYear();
    const sm = String(start.getMonth() + 1).padStart(2, '0');
    const sd = String(start.getDate()).padStart(2, '0');
    const startFormatted = `${sy}-${sm}-${sd}`;

    if (diffDays < 0) {
        const absDays = Math.abs(diffDays);
        return {
            text: absDays === 1 ? 'مستحق منذ أمس' : `مستحق (تجاوز ${absDays} يوم)`,
            status: 'expired',
            days: diffDays,
            targetDate: targetFormatted,
            createdDate: startFormatted,
            reminderDays
        };
    }

    if (diffDays === 0) {
        return {
            text: 'موعد التذكير اليوم',
            status: 'expiring-today',
            days: 0,
            targetDate: targetFormatted,
            createdDate: startFormatted,
            reminderDays
        };
    }

    if (diffDays === 1) {
        return {
            text: 'متبقي يوم واحد للتذكير',
            status: 'urgent',
            days: 1,
            targetDate: targetFormatted,
            createdDate: startFormatted,
            reminderDays
        };
    }

    if (diffDays <= 3) {
        return {
            text: `متبقي ${diffDays} أيام للتذكير`,
            status: 'urgent',
            days: diffDays,
            targetDate: targetFormatted,
            createdDate: startFormatted,
            reminderDays
        };
    }

    if (diffDays <= 7) {
        return {
            text: `متبقي ${diffDays} أيام للتذكير`,
            status: 'warning',
            days: diffDays,
            targetDate: targetFormatted,
            createdDate: startFormatted,
            reminderDays
        };
    }

    return {
        text: `متبقي ${diffDays} يوم للتذكير`,
        status: 'active',
        days: diffDays,
        targetDate: targetFormatted,
        createdDate: startFormatted,
        reminderDays
    };
};

/**
 * Migrate stored sheets config from old invoice_data to trash_data
 */
export const migrateSheetsConfig = () => {
    try {
        const saved = localStorage.getItem('sv_sheets_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                let changed = false;
                const updated = parsed.map(s => {
                    if (s.id === 'invoice_data') {
                        changed = true;
                        return { id: 'trash_data', name: 'سلة المهملات', icon: 'fa-trash-can', color: 'from-rose-600 to-red-600', badgeColor: 'bg-rose-500' };
                    }
                    return s;
                });
                if (changed) {
                    localStorage.setItem('sv_sheets_config', JSON.stringify(updated));
                }
            }
        }
    } catch {}
};

/**
 * Scan and repair all sheets in localStorage.
 * Fixes JSON syntax errors, non-array structures, null rows, and type incompatibilities.
 */
export const scanAndRepairAllSheets = (sheets = DEFAULT_SHEETS) => {
    migrateSheetsConfig();
    const report = {
        totalSheetsChecked: sheets.length,
        totalRecordsRepaired: 0,
        sheetsFixed: [],
        hasCorruptData: false
    };

    sheets.forEach(sheet => {
        const key = `${STORAGE_PREFIX}${sheet.id}`;
        const raw = localStorage.getItem(key);
        let parsed = [];
        let wasCorrupted = false;

        if (!raw) {
            localStorage.setItem(key, JSON.stringify([]));
            return;
        }

        try {
            parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                parsed = [];
                wasCorrupted = true;
            }
        } catch {
            parsed = [];
            wasCorrupted = true;
        }

        const cleaned = [];
        let sheetRepairedCount = 0;

        parsed.forEach((item, idx) => {
            const sanitized = sanitizeRecord(item, idx);
            if (sanitized) {
                // Check if any property was repaired or non-string
                const wasInvalid = (
                    typeof item.email !== 'string' ||
                    typeof item.password !== 'string' ||
                    typeof item.visa !== 'string' ||
                    typeof item.invoiceNumber !== 'string' ||
                    !item.id ||
                    (sheet.id === 'account_data' && (!item.accountCreatedDate || !item.reminderDays))
                );
                if (wasInvalid) sheetRepairedCount++;
                cleaned.push(sanitized);
            } else {
                wasCorrupted = true;
                sheetRepairedCount++;
            }
        });

        if (wasCorrupted || sheetRepairedCount > 0 || cleaned.length !== parsed.length) {
            report.hasCorruptData = true;
            report.totalRecordsRepaired += sheetRepairedCount;
            report.sheetsFixed.push(sheet.name || sheet.id);
            localStorage.setItem(key, JSON.stringify(cleaned));
        }
    });

    return report;
};

/**
 * Realistic Arabic sample data for all 4 sheets
 */
export const SAMPLE_DATA = {
    client_data: [
        {
            id: 'REC-CLI-101',
            email: 'ahmed.vip@gmail.com',
            password: 'Ah#Pass2025!',
            password2: 'Pin9988',
            duration: '3 شهور',
            startDate: '2025-01-15',
            deviceType: 'جهاز',
            paymentStatus: 'مدفوع',
            selectedAccount: 'master.acc1@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'عميل VIP نشط - اشتراك باقة بريميوم 4K',
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-CLI-102',
            email: 'sarah.khalil@outlook.com',
            password: 'Sarah!Strong#88',
            password2: 'Back$2024',
            duration: '6 شهور',
            startDate: '2025-02-01',
            deviceType: 'جهازين',
            paymentStatus: 'مدفوع',
            selectedAccount: 'cib.acc3@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'اشتراك 6 شهور مع كود خصم التجديد',
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-CLI-103',
            email: 'mahmoud.stream@gmail.com',
            password: 'M@hmoudPass9',
            password2: 'Code991',
            duration: '1 شهر',
            startDate: '2025-02-20',
            deviceType: 'جهاز',
            paymentStatus: 'غير مدفوع',
            selectedAccount: 'backup.acc2@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'بروفايل خاص - شاشة واحدة نتفلكس',
            created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-CLI-104',
            email: 'nour.vip.service@yahoo.com',
            password: 'Nour&Vip#2025',
            password2: 'NourSec44',
            duration: '5 شهور',
            startDate: '2025-03-01',
            deviceType: 'جهازين',
            paymentStatus: 'مدفوع',
            selectedAccount: 'qnb.acc4@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'باقة عائلية 5 بروفايلات تفعيل فوري',
            created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-CLI-105',
            email: 'tarek.almasry@gmail.com',
            password: 'Tarek$UltraPass',
            password2: 'Trk990',
            duration: '4 شهور',
            startDate: '2025-02-10',
            deviceType: 'جهاز',
            paymentStatus: 'مدفوع',
            selectedAccount: 'master.acc1@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'عميل مميز - باقة 4 شهور',
            created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
            updated_at: new Date().toISOString()
        }
    ],
    merchant_data: [
        {
            id: 'REC-MER-201',
            email: 'merchant.cairo@store.com',
            password: 'Cairo#Merch2025',
            password2: 'StorePin12',
            duration: '6 شهور',
            startDate: '2025-01-10',
            deviceType: 'جهازين',
            paymentStatus: 'مدفوع',
            selectedAccount: 'backup.acc2@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'تاجر معتمد - توريد 20 حساب شهرياً',
            created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-MER-202',
            email: 'alex.reseller@digital.net',
            password: 'Alex!Partner#99',
            password2: 'AlexKey2024',
            duration: '3 شهور',
            startDate: '2025-02-05',
            deviceType: 'جهاز',
            paymentStatus: 'مدفوع',
            selectedAccount: 'cib.acc3@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'موزع باقات الإسكندرية والساحل الشمالي',
            created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-MER-203',
            email: 'delta.distributor@shop.com',
            password: 'Delta#Dist998',
            password2: 'SecDelta',
            duration: '2 شهر',
            startDate: '2025-02-18',
            deviceType: 'جهاز',
            paymentStatus: 'مدفوع',
            selectedAccount: 'master.acc1@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'تحويل عن طريق محفظة فودافون كاش كاش باك 10%',
            created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-MER-204',
            email: 'gulf.trader@services.ae',
            password: 'Gulf#Trader2025',
            password2: 'GfPin55',
            duration: '6 شهور',
            startDate: '2025-01-01',
            deviceType: 'جهازين',
            paymentStatus: 'مدفوع',
            selectedAccount: 'qnb.acc4@servicevip.com',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'موزع معتمد للخليج العربي - حسابات بنكية دولية',
            created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
            updated_at: new Date().toISOString()
        }
    ],
    account_data: [
        {
            id: 'REC-ACC-301',
            email: 'master.acc1@servicevip.com',
            password: 'AccMaster#2025!',
            password2: 'SecSafe#01',
            duration: '',
            invoiceNumber: 'INV-2024-001',
            visa: '4111222233334589',
            visaAccount: 'البنك الأهلي المصري - فيزا كارت',
            accountCreatedDate: '2026-08-10',
            reminderDays: '30',
            notes: 'الحساب الرئيسي لشراء الاشتراكات - رصيد فعال',
            created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-ACC-302',
            email: 'backup.acc2@servicevip.com',
            password: 'Backup#Pass#99',
            password2: 'SecSafe#02',
            duration: '',
            invoiceNumber: 'INV-2024-002',
            visa: '5200889911223344',
            visaAccount: 'بنك مصر - فيزا مشتريات ذهبية',
            accountCreatedDate: '2026-08-01',
            reminderDays: '30',
            notes: 'حساب احتياطي لسداد الفواتير المعلقة',
            created_at: new Date(Date.now() - 86400000 * 9).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-ACC-303',
            email: 'cib.acc3@servicevip.com',
            password: 'CIB#UltraSafe#33',
            password2: 'SecSafe#03',
            duration: '',
            invoiceNumber: 'INV-2024-003',
            visa: '4000123456789010',
            visaAccount: 'CIB البنك التجاري الدولي',
            accountCreatedDate: '2026-08-25',
            reminderDays: '15',
            notes: 'شحن دوري بقيمة 200 دولار شهرياً',
            created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-ACC-304',
            email: 'qnb.acc4@servicevip.com',
            password: 'QNB#Acc2025#Safe',
            password2: 'SecSafe#04',
            duration: '',
            invoiceNumber: 'INV-2024-004',
            visa: '4716112233445566',
            visaAccount: 'QNB الأهلي - فيزا افتراضية',
            accountCreatedDate: '2026-09-01',
            reminderDays: '60',
            notes: 'مخصص لسداد اشتراكات نتفلكس والمنصات الترفيهية',
            created_at: new Date(Date.now() - 86400000 * 18).toISOString(),
            updated_at: new Date().toISOString()
        }
    ],
    trash_data: [
        {
            id: 'REC-TRASH-001',
            email: 'old.netflix@servicevip.com',
            password: 'OldPass#2024',
            password2: 'OldKey01',
            duration: '',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            accountCreatedDate: '2026-07-15',
            reminderDays: '30',
            notes: 'حساب قديم تم نقله للسلة بناءً على طلب الإدارة',
            deletedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
            originSheetId: 'account_data',
            originSheetName: 'بيانات الحساب',
            created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'REC-TRASH-002',
            email: 'expired.shahid@servicevip.com',
            password: 'Shahid#Safe99',
            password2: 'ShahidKey02',
            duration: '1 شهر',
            startDate: '2026-07-01',
            deviceType: 'جهاز',
            paymentStatus: 'مدفوع',
            invoiceNumber: '',
            visa: '',
            visaAccount: '',
            notes: 'انتهت مدة اشتراك الباقة ولم يتم التجديد',
            deletedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
            originSheetId: 'client_data',
            originSheetName: 'بيانات العميل',
            created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
            updated_at: new Date().toISOString()
        }
    ]
};

/**
 * Populate all 4 sheets with realistic sample data
 */
export const buildRealisticSampleData = (overwrite = true) => {
    let totalAdded = 0;
    Object.keys(SAMPLE_DATA).forEach(sheetId => {
        const key = `${STORAGE_PREFIX}${sheetId}`;
        const sampleRecords = SAMPLE_DATA[sheetId];
        if (overwrite) {
            localStorage.setItem(key, JSON.stringify(sampleRecords));
            totalAdded += sampleRecords.length;
        } else {
            const raw = localStorage.getItem(key);
            let existing = [];
            try {
                existing = JSON.parse(raw) || [];
            } catch {
                existing = [];
            }
            const merged = [...sampleRecords, ...existing];
            localStorage.setItem(key, JSON.stringify(merged));
            totalAdded += sampleRecords.length;
        }
    });
    return totalAdded;
};

/**
 * Reset all sheets cleanly
 */
export const resetAllSheets = (sheets = DEFAULT_SHEETS) => {
    sheets.forEach(sheet => {
        localStorage.setItem(`${STORAGE_PREFIX}${sheet.id}`, JSON.stringify([]));
    });
};
