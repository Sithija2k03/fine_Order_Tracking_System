import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { type ReactElement } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RoleSelectPage from './pages/RoleSelectPage';
import DepartmentSelectPage from './pages/DepartmentSelectPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import PickerSelectPage from './pages/PickerSelectPage';
import PickerDashboard from './pages/PickerDashboard';
import CheckerSelectPage from './pages/CheckerSelectPage';
import CheckerDashboard from './pages/CheckerDashboard';
import OrdersPage from './pages/admin/OrdersPanel'
import ApprovedOrdersPage from './pages/admin/ApprovedOrdersPage';
import SignOffPage from './pages/admin/SignOffPage';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './components/Toast';

function ProtectedRoute({ children }: { children: ReactElement }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <div className="pb-20 print:pb-0">
        <Routes>
          {/* Public */}
          <Route path="/" element={<RoleSelectPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pickers" element={<PickerSelectPage />} />
          <Route path="/picker/:id" element={<PickerDashboard />} />
          <Route path="/checkers" element={<CheckerSelectPage />} />
          <Route path="/checker/:id" element={<CheckerDashboard />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute><DepartmentSelectPage /></ProtectedRoute>} />
          <Route path="/admin/:department" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/:department/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
          <Route path="/admin/:department/approved" element={<ProtectedRoute><ApprovedOrdersPage /></ProtectedRoute>} />
          <Route path="/admin/:department/signoff" element={<ProtectedRoute><SignOffPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </div>
        <BottomNav />
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;