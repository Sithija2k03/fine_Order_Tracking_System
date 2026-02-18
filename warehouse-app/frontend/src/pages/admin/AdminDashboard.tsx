import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/index';

interface Picker { id: string; name: string; }
interface Checker { id: string; name: string; }

export default function AdminDashboard() {
  const { department } = useParams<{ department: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [pickers, setPickers] = useState<Picker[]>([]);
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [newPicker, setNewPicker] = useState('');
  const [newChecker, setNewChecker] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const deptLabel = department === 'machinery' ? '🔧 Machinery' : '🔩 Assembly';
  const dept = department || 'machinery';

  useEffect(() => { fetchData(); }, [department]);

  const fetchData = async () => {
    try {
      const [p, c] = await Promise.all([
        api.get(`/pickers?department=${dept}`),
        api.get(`/checkers?department=${dept}`)
      ]);
      setPickers(p.data);
      setCheckers(c.data);
    } catch (err) {
      console.error(err);
    }
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const addPicker = async () => {
    if (!newPicker.trim()) return;
    console.log('dept value is:', dept);        // ADD THIS
    console.log('newPicker value is:', newPicker); // ADD THIS
    setLoading(true);
    try {
      await api.post('/pickers', { name: newPicker.trim(), department: dept });
      setNewPicker('');
      showMessage('✅ Picker added successfully');
      fetchData();
    } catch { showMessage('❌ Failed to add picker'); }
    finally { setLoading(false); }
  };

  const addChecker = async () => {
    if (!newChecker.trim()) return;
    setLoading(true);
    try {
      await api.post('/checkers', { name: newChecker.trim(), department: dept });
      setNewChecker('');
      showMessage('✅ Checker added successfully');
      fetchData();
    } catch { showMessage('❌ Failed to add checker'); }
    finally { setLoading(false); }
  };

  const deletePicker = async (id: string) => {
    if (!confirm('Remove this picker?')) return;
    try {
      await api.delete(`/pickers/${id}`);
      showMessage('✅ Picker removed');
      fetchData();
    } catch { showMessage('❌ Failed to remove picker'); }
  };

  const deleteChecker = async (id: string) => {
    if (!confirm('Remove this checker?')) return;
    try {
      await api.delete(`/checkers/${id}`);
      showMessage('✅ Checker removed');
      fetchData();
    } catch { showMessage('❌ Failed to remove checker'); }
  };

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{deptLabel} Department</h1>
            <p className="text-blue-300 text-sm md:text-base mt-1">Manage pickers and checkers</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => navigate(`/admin/${dept}/orders`)}
              className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
            >
              📋 Orders
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-white font-semibold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
            >
              ← Back
            </button>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-semibold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
            >
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="bg-blue-100 text-blue-900 px-4 py-3 rounded-xl mb-4 font-medium text-center">
            {message}
          </div>
        )}

        {/* Two column layout on tablet+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Pickers Section */}
          <div className="bg-white rounded-2xl p-4 md:p-6">
            <h2 className="text-xl font-bold text-blue-900 mb-4">🧳 Pickers</h2>

            {/* Add Picker */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPicker}
                onChange={e => setNewPicker(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPicker()}
                placeholder="Picker name"
                className="flex-1 px-3 py-3 border-2 border-blue-100 rounded-xl text-sm md:text-base focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addPicker}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-4 py-3 rounded-xl transition-all"
              >
                + Add
              </button>
            </div>

            {/* Pickers List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pickers.length === 0 ? (
                <p className="text-blue-300 text-center py-4">No pickers added yet</p>
              ) : (
                pickers.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-blue-50 px-4 py-3 rounded-xl">
                    <span className="font-medium text-blue-900 text-sm md:text-base">{p.name}</span>
                    <button
                      onClick={() => deletePicker(p.id)}
                      className="text-red-500 hover:text-red-700 font-bold text-lg transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Checkers Section */}
          <div className="bg-white rounded-2xl p-4 md:p-6">
            <h2 className="text-xl font-bold text-blue-900 mb-4">✅ Checkers</h2>

            {/* Add Checker */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newChecker}
                onChange={e => setNewChecker(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChecker()}
                placeholder="Checker name"
                className="flex-1 px-3 py-3 border-2 border-blue-100 rounded-xl text-sm md:text-base focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addChecker}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-4 py-3 rounded-xl transition-all"
              >
                + Add
              </button>
            </div>

            {/* Checkers List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {checkers.length === 0 ? (
                <p className="text-blue-300 text-center py-4">No checkers added yet</p>
              ) : (
                checkers.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-blue-50 px-4 py-3 rounded-xl">
                    <span className="font-medium text-blue-900 text-sm md:text-base">{c.name}</span>
                    <button
                      onClick={() => deleteChecker(c.id)}
                      className="text-red-500 hover:text-red-700 font-bold text-lg transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}