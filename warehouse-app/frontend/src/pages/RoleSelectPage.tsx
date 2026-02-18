import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleSelectPage() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center p-4 md:p-6">
      <div className="text-center mb-8 md:mb-12">
        <div className="text-5xl md:text-6xl mb-3">📦</div>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white">FINE Enterprises</h1>
        <p className="text-blue-300 mt-2 text-base md:text-lg">Order Tracking System</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs md:max-w-sm lg:max-w-md">
        <button
          onClick={() => navigate('/pickers')}
          className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold py-5 md:py-6 rounded-2xl text-xl md:text-2xl shadow-lg transition-all"
        >
          🧳 I'm a Picker
        </button>

        <button
          onClick={() => navigate('/checkers')}
          className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold py-5 md:py-6 rounded-2xl text-xl md:text-2xl shadow-lg transition-all"
        >
          ✅ I'm a Checker
        </button>

        {isAdmin ? (
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => navigate('/admin')}
              className="flex-1 bg-white hover:bg-blue-50 active:scale-95 text-blue-900 font-bold py-4 rounded-2xl text-base md:text-lg transition-all"
            >
              ⚙️ Admin Panel
            </button>
            <button
              onClick={logout}
              className="bg-blue-900 hover:bg-blue-800 active:scale-95 text-white font-bold py-4 px-5 rounded-2xl text-lg transition-all"
            >
              🚪
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="mt-2 bg-blue-900 hover:bg-blue-800 active:scale-95 text-blue-200 font-semibold py-3 md:py-4 rounded-2xl text-base transition-all"
          >
            🔐 Admin Login
          </button>
        )}
      </div>
    </div>
  );
}