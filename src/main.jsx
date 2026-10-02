import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'


// تنظيف فوري وشامل لأي كاش أو حسابات قديمة مخزنة في متصفح العميل عند تحميل التطبيق
try {
    const blocked = ['admin@servicevip.com', 'support@servicevip.com', 'alaa@servicevip.com', 'admin'];
    const raw = localStorage.getItem('sv_users');
    if (raw) {
        let list = JSON.parse(raw);
        if (Array.isArray(list)) {
            list = list.filter(u => {
                const un = (u.username || '').toLowerCase();
                const em = (u.email || '').toLowerCase();
                if (blocked.includes(un) || blocked.includes(em)) return false;
                if (u.role === 'admin' && un !== 'servicevip') return false;
                if (u.id === 'admin_root' && un !== 'servicevip') return false;
                return true;
            });
            localStorage.setItem('sv_users', JSON.stringify(list));
        }
    }
    const session = sessionStorage.getItem('service-vip_session_user');
    if (session) {
        const u = JSON.parse(session);
        const un = (u?.username || '').toLowerCase();
        if (blocked.includes(un)) {
            sessionStorage.clear();
        }
    }
} catch (e) {}

createRoot(document.getElementById("root")).render(
    <App />
);