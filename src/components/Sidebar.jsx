import { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { calculateRemainingTime, calculateAccountReminder } from '../utils/dataRepair';

const DEFAULT_SHEETS = [
    { id: 'client_data', label: 'بيانات العميل', icon: 'fa-user-tie', color: 'text-blue-400', activeBg: 'bg-blue-600' },
    { id: 'merchant_data', label: 'بيانات التاجر', icon: 'fa-store', color: 'text-emerald-400', activeBg: 'bg-emerald-600' },
    { id: 'account_data', label: 'بيانات الحساب', icon: 'fa-shield-halved', color: 'text-purple-400', activeBg: 'bg-purple-600' },
    { id: 'trash_data', label: 'سلة المهملات', icon: 'fa-trash-can', color: 'text-rose-400', activeBg: 'bg-rose-600' },
];

export default function Sidebar ({ isOpen, onClose }) {
    const { activeTab, setActiveTab } = useData();
    const { user, logout, hasPermission } = useAuth();
    const [sheetCounts, setSheetCounts] = useState({});
    const [totalAlertsCount, setTotalAlertsCount] = useState(0);
    const [sheetItems, setSheetItems] = useState(DEFAULT_SHEETS);

    const [isDark, setIsDark] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sv_dark_mode') === 'true' || document.documentElement.classList.contains('dark');
        }
        return false;
    });

    // Apply dark mode on mount
    useEffect(() => {
        const saved = localStorage.getItem('sv_dark_mode');
        if (saved === 'true') {
            document.documentElement.classList.add('dark');
            setIsDark(true);
        }
    }, []);

    const toggleDarkMode = () => {
        const newVal = !isDark;
        setIsDark(newVal);
        document.documentElement.classList.toggle('dark', newVal);
        localStorage.setItem('sv_dark_mode', String(newVal));
    };

    // Filter sheets according to user permissions
    const visibleSheets = useMemo(() => {
        if (!user) return [];
        if (user.role === 'admin') return sheetItems;
        return sheetItems.filter(item => {
            return hasPermission('sheet_' + item.id) || hasPermission(item.id);
        });
    }, [sheetItems, user, hasPermission]);

    // Load sheet labels, counts, and alerts
    const loadSheetInfo = () => {
        try {
            const savedConfig = localStorage.getItem('sv_sheets_config');
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                setSheetItems(DEFAULT_SHEETS.map(ds => {
                    const found = parsed.find(p => p.id === ds.id);
                    return found ? { ...ds, label: found.name || ds.label } : ds;
                }));
            }
        } catch {}

        const counts = {};
        DEFAULT_SHEETS.forEach(s => {
            try {
                const data = localStorage.getItem(`sv_custom_sheet_${s.id}`);
                counts[s.id] = data ? JSON.parse(data).length : 0;
            } catch {
                counts[s.id] = 0;
            }
        });
        setSheetCounts(counts);

        // Count pending renewal alerts (near renewal <= 3 days or expired < 0) for permitted subscription sheets only
        let alertsTotal = 0;
        visibleSheets.forEach(s => {
            if (s.id === 'trash_data' || s.id === 'account_data') return;
            try {
                const data = localStorage.getItem(`sv_custom_sheet_${s.id}`);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(r => {
                            const rem = calculateRemainingTime(r.startDate, r.duration, r.created_at);
                            if (!rem || rem.status === 'none' || rem.status === 'lifetime') return;
                            if (rem.days !== null && rem.days <= 3) alertsTotal++;
                        });
                    }
                }
            } catch {}
        });
        setTotalAlertsCount(alertsTotal);
    };

    useEffect(() => {
        loadSheetInfo();
        const interval = setInterval(loadSheetInfo, 2000);
        return () => clearInterval(interval);
    }, [activeTab, visibleSheets]);

    return (
        <>
            {isOpen && (
                <div onClick={onClose} className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"></div>
            )}

            <aside className={`fixed top-0 bottom-0 right-0 w-64 bg-slate-900 text-white z-50 flex flex-col shadow-2xl overflow-hidden font-sans transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>

                {/* Sidebar Header */}
                <div className="p-5 border-b border-slate-800 relative">
                    <button onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-white lg:hidden cursor-pointer">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 vip-logo-badge border border-white/25 shadow-lg">
                            <span className="text-white font-black text-2xl italic tracking-tighter select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] font-sans -mt-0.5">V</span>
                            <div className="logo-shine-sweep"></div>
                        </div>
                        <div className="overflow-hidden">
                            <h1 className="text-lg font-black tracking-tight truncate vip-animated-text">Service VIP</h1>
                            <p className="text-[10px] text-indigo-300 font-bold tracking-wider uppercase block truncate">Data Management Sheet</p>
                        </div>
                    </div>
                </div>

                {/* Single Unified Navigation List */}
                <nav className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                    {/* Dashboard Button (الرئيسية) */}
                    {(user?.role === 'admin' || hasPermission('dashboard')) && (
                        <button
                            onClick={() => { setActiveTab('dashboard'); onClose(); }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group relative cursor-pointer ${
                                activeTab === 'dashboard'
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg font-black scale-[1.02]'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white font-bold'
                            }`}
                        >
                            <div className="flex items-center gap-3.5 min-w-0">
                                <i className={`fa-solid fa-house w-5 text-center text-base transition-transform group-hover:scale-110 ${
                                    activeTab === 'dashboard' ? 'text-white' : 'text-blue-400'
                                }`}></i>
                                <span className="text-sm truncate">الرئيسية</span>
                            </div>
                        </button>
                    )}

                    {/* Users Management Button - Admin Only */}
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => { setActiveTab('users'); onClose(); }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group relative cursor-pointer ${
                                activeTab === 'users'
                                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg font-black scale-[1.02]'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white font-bold'
                            }`}
                        >
                            <div className="flex items-center gap-3.5 min-w-0">
                                <i className={`fa-solid fa-users-gear w-5 text-center text-base transition-transform group-hover:scale-110 ${
                                    activeTab === 'users' ? 'text-white' : 'text-purple-400'
                                }`}></i>
                                <span className="text-sm truncate">المستخدمين</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                                activeTab === 'users' ? 'bg-white/20 text-white' : 'bg-purple-950 text-purple-300 border border-purple-800'
                            }`}>
                                أدمن
                            </span>
                        </button>
                    )}
                    {visibleSheets.map(item => {
                        const isCurrentActive = activeTab === item.id;
                        const count = sheetCounts[item.id] || 0;

                        return (
                            <button
                                key={item.id}
                                onClick={() => { setActiveTab(item.id); onClose(); }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group relative cursor-pointer ${
                                    isCurrentActive
                                        ? `${item.activeBg || 'bg-indigo-600'} text-white shadow-lg font-bold scale-[1.02]`
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white font-medium'
                                }`}
                            >
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <i className={`fa-solid ${item.icon} w-5 text-center text-base transition-transform group-hover:scale-110 ${
                                        isCurrentActive ? 'text-white' : item.color
                                    }`}></i>
                                    <span className="text-sm truncate">{item.label}</span>
                                </div>

                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-black flex-shrink-0 ${
                                    isCurrentActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}

                    {/* Alerts item (التنبيهات لوحدها مع قائمة الشيت) */}
                    {(user?.role === 'admin' || hasPermission('dashboard') || hasPermission('alerts') || hasPermission('renewals')) && (
                        <button
                            onClick={() => { setActiveTab('alerts'); onClose(); }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group relative cursor-pointer ${
                                activeTab === 'alerts'
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg font-black scale-[1.02]'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white font-medium'
                            }`}
                        >
                            <div className="flex items-center gap-3.5 min-w-0">
                                <i className={`fa-solid fa-bell w-5 text-center text-base transition-transform group-hover:scale-110 ${
                                    activeTab === 'alerts' ? 'text-white' : 'text-amber-400'
                                }`}></i>
                                <span className="text-sm truncate">التنبيهات</span>
                            </div>

                            {totalAlertsCount > 0 ? (
                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-black flex items-center gap-1 ${
                                    activeTab === 'alerts' ? 'bg-white text-orange-600 shadow-sm' : 'bg-amber-500 text-white animate-pulse'
                                }`}>
                                    <i className="fa-solid fa-bell text-[9px]"></i>
                                    <span>{totalAlertsCount}</span>
                                </span>
                            ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-black">
                                    0
                                </span>
                            )}
                        </button>
                    )}
                </nav>



                {/* User Profile & Dark Mode & Logout */}
                <div className="p-4 border-t border-slate-800 bg-slate-900">
                    <div className="flex items-center gap-3 mb-3 px-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow-lg">
                            <i className="fa-solid fa-shield-halved text-xs"></i>
                        </div>
                        <div className="overflow-hidden flex-1">
                            <h4 className="text-xs font-bold text-white truncate">
                                {user?.role === 'admin' ? 'لوحة الإدارة' : 'لوحة التحكم'}
                            </h4>
                            <span className="text-[10px] text-emerald-400 font-bold tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                                متصل الآن
                            </span>
                        </div>
                        {/* Dark Mode Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-yellow-400 transition-all border border-slate-700"
                            title={isDark ? 'الوضع الفاتح' : 'الوضع المظلم'}
                        >
                            <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'} text-sm`}></i>
                        </button>
                    </div>

                    {user && (
                        <button
                            onClick={logout}
                            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-400 py-2.5 rounded-xl transition-all border border-slate-700 hover:border-red-500/50 font-bold text-xs"
                        >
                            <i className="fa-solid fa-right-from-bracket"></i> تسجيل خروج
                        </button>
                    )}
                </div>
            </aside>
        </>
    );
}