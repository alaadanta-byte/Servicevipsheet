import { useState, useEffect } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import CustomSheets from './components/CustomSheets';
import DashboardAlerts from './components/DashboardAlerts';
import Users from './components/Users';

const MainLayout = () => {
  const { user, hasPermission } = useAuth();
  const { activeTab, setActiveTab } = useData();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // Safety fallback if the restored tab is not permitted for the logged in user
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'users' && user.role !== 'admin') {
      setActiveTab('client_data');
    } else if (activeTab === 'dashboard' && user.role !== 'admin' && !hasPermission('dashboard')) {
      setActiveTab('client_data');
    }
  }, [user, activeTab, hasPermission, setActiveTab]);

  if (!user) return <Login />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 dir-rtl flex transition-colors duration-200" style={{ direction: 'rtl' }}>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 lg:mr-64 p-2.5 sm:p-4 lg:p-4 transition-all duration-300 w-full min-w-0">
        <div className="max-w-[1600px] mx-auto space-y-3 md:space-y-5">

          {/* Top Center Blessing Banner */}
          <div className="flex justify-center items-center w-full pt-1 pb-1">
            <div className="blessing-banner-box bg-white/85 dark:bg-slate-900/90 backdrop-blur-md px-5 sm:px-8 py-2 md:py-2.5 rounded-full border border-amber-400/40 dark:border-amber-400/30 shadow-lg flex items-center justify-center gap-2.5 sm:gap-3 transition-all hover:scale-[1.02] cursor-default max-w-full">
              <div className="blessing-shine-sweep"></div>
              <span className="text-amber-500 dark:text-amber-400 text-sm sm:text-base animate-pulse select-none flex-shrink-0">✨</span>
              <h2 className="blessing-animated-text text-xs sm:text-sm md:text-base lg:text-lg font-black tracking-wide text-center select-none py-0.5 leading-snug">
                صلِّ على سيدنا ونبينا محمد صلى الله عليه وسلم
              </h2>
              <span className="text-amber-500 dark:text-amber-400 text-sm sm:text-base animate-pulse select-none flex-shrink-0">✨</span>
            </div>
          </div>

          {/* Mobile Header */}
          <div className="flex justify-between items-center mb-4 lg:hidden bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center text-white vip-logo-badge border border-white/25 shadow-md flex-shrink-0">
                <span className="text-white font-black text-xl italic tracking-tighter select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] font-sans -mt-0.5">V</span>
                <div className="logo-shine-sweep"></div>
              </div>
              <div className="overflow-hidden">
                <h2 className="text-base font-black truncate vip-animated-text leading-tight">Service VIP</h2>
                <p className="text-[10px] text-slate-400 dark:text-indigo-300 font-bold tracking-wider uppercase block truncate">Data Management Sheet</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <i className="fa-solid fa-bars text-lg"></i>
            </button>
          </div>

          {/* Main View: Dashboard OR Alerts OR Users OR Custom Sheet */}
          {activeTab === 'dashboard' || activeTab === 'alerts' ? (
            <DashboardAlerts
              mode={activeTab === 'alerts' ? 'alerts' : 'dashboard'}
              onNavigateSheet={(sheetId) => setActiveTab(sheetId)}
            />
          ) : activeTab === 'users' ? (
            <Users />
          ) : (
            <CustomSheets
              activeSheetId={activeTab || 'client_data'}
              setActiveSheetId={setActiveTab}
            />
          )}

        </div>
      </main>
    </div>
  );
};

function App () {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <ConfirmProvider>
            <MainLayout />
          </ConfirmProvider>
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;