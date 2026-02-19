import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DepartmentSelectPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center p-4 md:p-6">
      <div className="text-center mb-8 md:mb-12">
        <div className="text-5xl md:text-6xl mb-3">⚙️</div>
        <h1 className="text-3xl md:text-4xl font-bold text-white">Admin Panel</h1>
        <p className="text-blue-300 mt-2 text-base md:text-lg">Select a Department</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs md:max-w-sm lg:max-w-md">
        <button
          onClick={() => navigate('/admin/machinery')}
          className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold py-6 md:py-8 rounded-2xl text-xl md:text-2xl shadow-lg transition-all"
        >
          🔧 Machinery
        </button>

        <button
          onClick={() => navigate('/admin/assembly')}
          className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-white font-bold py-6 md:py-8 rounded-2xl text-xl md:text-2xl shadow-lg transition-all"
        >
          🔩 Accessories
        </button>

        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate('/')}
            className="flex-1 bg-blue-900 hover:bg-blue-800 active:scale-95 text-blue-200 font-semibold py-3 rounded-2xl text-base transition-all"
          >
            ← Home
          </button>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-semibold py-3 px-5 rounded-2xl text-base transition-all"
          >
            🚪 Logout
          </button>
        </div>
      </div>
    </div>
  );
}