import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { type ReactElement } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RoleSelectPage from './pages/RoleSelectPage';
import PickerSelectPage from './pages/PickerSelectPage';
import PickerDashboard from './pages/PickerDashboard';
import CheckerSelectPage from './pages/CheckerSelectPage';
import CheckerDashboard from './pages/CheckerDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

function ProtectedRoute({ children }: { children: ReactElement }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<RoleSelectPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pickers" element={<PickerSelectPage />} />
          <Route path="/picker/:id" element={<PickerDashboard />} />
          <Route path="/checkers" element={<CheckerSelectPage />} />
          <Route path="/checker/:id" element={<CheckerDashboard />} />

          {/* Admin only */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;