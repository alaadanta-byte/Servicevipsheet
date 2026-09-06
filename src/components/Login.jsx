import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login () {
    const { login } = useAuth();
    const [creds, setCreds] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const result = await login(creds.username, creds.password);
            if (!result.success) {
                setError(result.message || 'البريد الإلكتروني أو كلمة المرور خطأ');
            }
        } catch (err) {
            setError('حدث خطأ في الاتصال. تأكد من اتصالك بالإنترنت.');
        }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 font-sans dir-rtl gap-5">
            {/* Top Blessing Banner */}
            <div className="blessing-banner-box bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full border border-amber-400/40 shadow-lg flex items-center justify-center gap-2.5 animate-fade-in">
                <div className="blessing-shine-sweep"></div>
                <span className="text-amber-500 text-sm animate-pulse select-none">✨</span>
                <span className="blessing-animated-text text-xs sm:text-sm md:text-base font-black tracking-wide text-center select-none py-0.5">
                    صلِّ على سيدنا ونبينا محمد صلى الله عليه وسلم
                </span>
                <span className="text-amber-500 text-sm animate-pulse select-none">✨</span>
            </div>

            <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden animate-fade-in border border-white/50">

                {/* زخرفة خلفية جمالية */}
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-blue-500"></div>
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-2xl opacity-60"></div>
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-50 rounded-full blur-2xl opacity-60"></div>

                <div className="text-center mb-10 relative z-10">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl vip-logo-badge border border-white/40">
                        <span className="text-white font-black text-4xl italic tracking-tighter select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] font-sans -mt-1">V</span>
                        <div className="logo-shine-sweep"></div>
                    </div>
                    <h2 className="text-3xl font-black mb-1.5 tracking-tight vip-animated-text">Service VIP</h2>
                    <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-widest mb-1">Data Management Sheet</p>
                    <p className="text-slate-400 font-medium text-xs">سجل الدخول للمتابعة إلى لوحة التحكم</p>
                </div>

                {error && (
                    <div className="bg-red-50 border-r-4 border-red-500 text-red-700 p-4 rounded-xl text-sm font-bold mb-6 flex items-center gap-3 animate-pulse">
                        <i className="fa-solid fa-circle-exclamation text-lg"></i>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6 relative z-10">
                    <div>
                        <label className="label-style">البريد الإلكتروني أو اسم المستخدم</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="input-style pl-10 font-bold"
                                value={creds.username}
                                onChange={e => setCreds({ ...creds, username: e.target.value })}
                                required
                                placeholder="Email"
                            />
                            <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                        </div>
                    </div>
                    <div>
                        <label className="label-style">كلمة المرور</label>
                        <div className="relative">
                            <input
                                type="password"
                                className="input-style pl-10 font-mono"
                                value={creds.password}
                                onChange={e => setCreds({ ...creds, password: e.target.value })}
                                required
                                placeholder="••••••••"
                            />
                            <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                        </div>
                    </div>

                    <button 
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-lg mt-2 disabled:opacity-60"
                    >
                        {isLoading ? (
                            <i className="fa-solid fa-spinner fa-spin"></i>
                        ) : (
                            <>تسجيل الدخول <i className="fa-solid fa-arrow-left text-sm"></i></>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center text-xs text-slate-400 font-medium relative z-10">
                    Service VIP v2.0 — Online
                </div>
            </div>

            {/* CSS Styles Injection */}
            <style>{`
                .label-style { @apply block text-sm font-extrabold text-slate-800 mb-2 ml-1 tracking-wide; }
                .input-style { @apply w-full bg-white border-2 border-slate-300 text-slate-900 text-sm font-bold rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 block p-3.5 transition-all outline-none placeholder-slate-400 shadow-sm; }
                .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}
            </style>
        </div>
    );
}