import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();
const SESSION_USER_KEY = 'service-vip_session_user';
const SESSION_TOKEN_KEY = 'service-vip_session_token';

export const AuthProvider = ({ children }) => {
    // البدء بحالة فارغة أو استعادة الجلسة فقط إذا وجد توكن في المتصفح الحالي
    const [user, setUser] = useState(() => {
        try {
            // مسح أي توكن قديم من localStorage لضمان عدم وجود تسجيل دخول غير مصرح به
            localStorage.removeItem('service-vip_user');
            localStorage.removeItem('service-vip_token');

            const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
            const sessionUser = sessionStorage.getItem(SESSION_USER_KEY);
            if (sessionToken && sessionUser) {
                return JSON.parse(sessionUser);
            }
            return null;
        } catch {
            return null;
        }
    });

    const [loading, setLoading] = useState(false);

    // دالة تسجيل الخروج للجلسة الحالية
    const logout = useCallback(async () => {
        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (token) {
            try { await authAPI.logout(token); } catch { }
        }
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_USER_KEY);
        localStorage.removeItem('service-vip_token');
        localStorage.removeItem('service-vip_user');
        setUser(null);
    }, []);

    // دالة تسجيل خروج جميع الجلسات من كافة الأجهزة والمتصفحات
    const logoutAll = useCallback(async () => {
        try {
            await authAPI.logoutAll();
        } catch (e) {
            console.error('Logout all error:', e);
        }
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_USER_KEY);
        localStorage.removeItem('service-vip_token');
        localStorage.removeItem('service-vip_user');
        setUser(null);
    }, []);

    // التحقق من صحة وصلاحية التوكن مع الخادم
    const verifySession = useCallback(async () => {
        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (!token) {
            setUser(null);
            return false;
        }

        try {
            const userData = await authAPI.checkAuth(token);
            if (userData) {
                setUser(userData);
                sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(userData));
                return true;
            } else {
                // التوكن تم إلغاؤه أو تسجيل خروجه في الخادم -> إخراج فوري
                sessionStorage.removeItem(SESSION_TOKEN_KEY);
                sessionStorage.removeItem(SESSION_USER_KEY);
                localStorage.removeItem('service-vip_token');
                localStorage.removeItem('service-vip_user');
                setUser(null);
                return false;
            }
        } catch (error) {
            console.warn('Auth verify error:', error);
            return false;
        }
    }, []);

    // فحص صلاحية الجلسة عند البدء، وعند الرجوع للتبويب، وبشكل دوري كل 30 ثانية
    useEffect(() => {
        verifySession();

        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                verifySession();
            }
        };

        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);

        const timer = setInterval(() => {
            verifySession();
        }, 30000);

        return () => {
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            clearInterval(timer);
        };
    }, [verifySession]);

    const login = async (username, password) => {
        try {
            const result = await authAPI.login(username, password);
            if (result && result.status === 'success') {
                sessionStorage.setItem(SESSION_TOKEN_KEY, result.token);
                sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(result.user));
                setUser(result.user);
                return { success: true };
            }
            return { success: false, message: result?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة' };
        } catch (e) {
            console.error('Login error:', e);
            return { success: false, message: e?.message || 'حدث خطأ أثناء تسجيل الدخول' };
        }
    };

    const hasPermission = (perm) => {
        if (!user) return false;
        if (user.role === 'admin' || (Array.isArray(user.permissions) && user.permissions.includes('all'))) return true;
        if (!user.permissions) return false;
        return Array.isArray(user.permissions) ? user.permissions.includes(perm) : false;
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, logoutAll, verifySession, hasPermission, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);