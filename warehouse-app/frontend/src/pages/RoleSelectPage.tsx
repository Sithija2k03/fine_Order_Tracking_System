import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleSelectPage() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">

      {/* Header */}
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">📦</div>
        <h1 className="text-4xl font-bold text-white">FINE Enterprises</h1>
        <p className="text-gray-400 mt-2 text-lg">Order Tracking System</p>
      </div>

      {/* Role Buttons */}
      <div className="flex flex-col gap-5 w-full max-w-sm">

        <button
          onClick={() => navigate('/pickers')}
          className="bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold py-6 rounded-2xl text-2xl shadow-lg transition-all"
        >
          🧳 I'm a Picker
        </button>

        <button
          onClick={() => navigate('/checkers')}
          className="bg-yellow-500 hover:bg-yellow-600 active:scale-95 text-white font-bold py-6 rounded-2xl text-2xl shadow-lg transition-all"
        >
          ✅ I'm a Checker
        </button>

        {/* Admin button */}
        {isAdmin ? (
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => navigate('/admin')}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl text-lg transition-all"
            >
              ⚙️ Admin Panel
            </button>
            <button
              onClick={() => { logout(); }}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-4 px-5 rounded-2xl text-lg transition-all"
            >
              🚪
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="mt-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 rounded-2xl text-base transition-all"
          >
            🔐 Admin Login
          </button>
        )}
      </div>
    </div>
  );
}