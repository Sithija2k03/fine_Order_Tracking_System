import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/index';

interface Checker { id: string; name: string; department: string; }

export default function CheckerSelectPage() {
  const navigate = useNavigate();
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [department, setDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCheckers = async (dept: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/checkers?department=${dept}`);
      setCheckers(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const selectDepartment = (dept: string) => {
    setDepartment(dept);
    fetchCheckers(dept);
  };

  // Department selection screen
  if (!department) {
    return (
      <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center p-4 md:p-6">
        <div className="text-center mb-8 md:mb-12">
          <div className="text-5xl md:text-6xl mb-3">✅</div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Checker Login</h1>
          <p className="text-blue-300 mt-2 text-base md:text-lg">Select your department</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs md:max-w-sm">
          <button
            onClick={() => selectDepartment('machinery')}
            className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold py-6 md:py-8 rounded-2xl text-xl md:text-2xl shadow-lg transition-all"
          >
            🔧 Machinery
          </button>
          <button
            onClick={() => selectDepartment('assembly')}
            className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-white font-bold py-6 md:py-8 rounded-2xl text-xl md:text-2xl shadow-lg transition-all"
          >
            🔩 Accessories
          </button>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-900 hover:bg-blue-800 active:scale-95 text-blue-200 font-semibold py-3 rounded-2xl text-base transition-all mt-2"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Checker tiles screen
  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">

        <div className="text-center mb-6 md:mb-10">
          <div className="text-4xl md:text-5xl mb-2">✅</div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {department === 'machinery' ? '🔧 Machinery' : '🔩 Accessories'} — Checkers
          </h1>
          <p className="text-blue-300 mt-1">Tap your name to continue</p>
        </div>

        <button
          onClick={() => { setDepartment(null); setCheckers([]); }}
          className="mb-6 bg-blue-900 hover:bg-blue-800 active:scale-95 text-blue-200 font-semibold py-2 px-5 rounded-xl text-sm transition-all"
        >
          ← Change Department
        </button>

        {loading && (
          <div className="text-center text-blue-300 py-12 text-lg">Loading...</div>
        )}

        {!loading && checkers.length === 0 && (
          <div className="text-center text-blue-300 py-12 text-lg">
            No checkers found for this department
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {checkers.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/checker/${c.id}?dept=${department}`)}
              className="bg-white hover:bg-blue-50 active:scale-95 text-blue-900 font-bold rounded-2xl shadow-lg transition-all aspect-square flex flex-col items-center justify-center gap-2 p-4"
            >
              <span className="text-4xl md:text-5xl">👤</span>
              <span className="text-sm md:text-base text-center leading-tight">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}