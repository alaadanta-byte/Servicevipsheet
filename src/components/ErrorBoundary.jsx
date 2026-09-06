import React from 'react';
import { RefreshCw, Wrench, ShieldAlert } from 'lucide-react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleAutoRepair = () => {
        try {
            // Repair all custom sheet storage entries
            for (let i = 1; i <= 10; i++) {
                const key = `sv_custom_sheet_${i}`;
                const raw = localStorage.getItem(key);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (!Array.isArray(parsed)) {
                            localStorage.setItem(key, JSON.stringify([]));
                        } else {
                            const cleaned = parsed
                                .filter(item => item && typeof item === 'object')
                                .map((item, idx) => ({
                                    id: item.id || Date.now() + idx,
                                    invoice: String(item.invoice || item['رقم الفاتورة'] || '').trim(),
                                    name: String(item.name || item['اسم العميل'] || '').trim(),
                                    phone: String(item.phone || item['رقم الهاتف'] || '').trim(),
                                    email: String(item.email || item['الإيميل'] || '').trim(),
                                    password: String(item.password || item['الباسورد'] || '').trim(),
                                    profile: String(item.profile || item['البروفايل'] || '').trim(),
                                    visa: String(item.visa || item['الفيزا'] || '').trim(),
                                    date: String(item.date || item['تاريخ التجديد'] || '').trim(),
                                    notes: String(item.notes || item['ملاحظات'] || '').trim()
                                }));
                            localStorage.setItem(key, JSON.stringify(cleaned));
                        }
                    } catch {
                        localStorage.setItem(key, JSON.stringify([]));
                    }
                }
            }
            alert('تم فحص وإصلاح ملفات البيانات التالفة بنجاح! سيتم إعادة تحميل الصفحة الآن.');
            window.location.reload();
        } catch (e) {
            console.error('Failed to auto-repair:', e);
            alert('حدث خطأ أثناء محاولة الإصلاح التلقائي: ' + e.message);
        }
    };

    handleResetAll = () => {
        if (window.confirm('هل أنت متأكد من رغبتك في مسح البيانات وإعادة تهيئة الموقع من الصفر؟')) {
            try {
                for (let i = 1; i <= 10; i++) {
                    localStorage.removeItem(`sv_custom_sheet_${i}`);
                }
                localStorage.removeItem('sv_active_custom_sheet');
                window.location.reload();
            } catch (e) {
                console.error(e);
            }
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    direction: 'rtl',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <div style={{
                        maxWidth: '560px',
                        width: '100%',
                        backgroundColor: '#1e293b',
                        borderRadius: '16px',
                        border: '1px solid #334155',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        padding: '32px',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            margin: '0 auto 20px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ef4444'
                        }}>
                            <ShieldAlert size={36} />
                        </div>

                        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px', color: '#fff' }}>
                            عذراً، حدث تعارض أو تلف في البيانات المعروضة
                        </h2>

                        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.7', marginBottom: '24px' }}>
                            تم إيقاف الواجهة لتفادي فقدان البيانات بسبب وجود قيم غير متوافقة في الذاكرة المحلية أو استيراد خاطئ. يمكنك استخدام أدوات الإصلاح أدناه للتعافي فوراً دون مشاكل.
                        </p>

                        {this.state.error && (
                            <div style={{
                                backgroundColor: '#090d16',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                marginBottom: '24px',
                                textAlign: 'left',
                                direction: 'ltr',
                                fontSize: '12px',
                                color: '#f87171',
                                overflowX: 'auto',
                                fontFamily: 'monospace'
                            }}>
                                {this.state.error.toString()}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button
                                onClick={this.handleAutoRepair}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px 20px',
                                    borderRadius: '10px',
                                    backgroundColor: '#2563eb',
                                    color: '#fff',
                                    border: 'none',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <Wrench size={18} />
                                إصلاح البيانات التالفة تلقائياً واستئناف العمل
                            </button>

                            <button
                                onClick={this.handleReload}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px 20px',
                                    borderRadius: '10px',
                                    backgroundColor: '#334155',
                                    color: '#f8fafc',
                                    border: '1px solid #475569',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                <RefreshCw size={18} />
                                إعادة تحميل الصفحة
                            </button>

                            <button
                                onClick={this.handleResetAll}
                                style={{
                                    marginTop: '8px',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    backgroundColor: 'transparent',
                                    color: '#f87171',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    textDecoration: 'underline'
                                }}
                            >
                                إعادة ضبط المصنع ومسح البيانات العالقة
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
