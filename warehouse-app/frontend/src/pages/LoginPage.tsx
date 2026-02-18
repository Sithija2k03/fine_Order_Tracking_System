import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/index';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  if (!username || !password) {
    setError('Please enter username and password');
    return;
  }
  setLoading(true);
  setError('');
  try {
    const res = await api.post('/auth/login', { username, password });
    
    console.log('Full response:', res);
    console.log('Token:', res.data.token);
    
    if (!res.data.token) {
      setError('No token received from server');
      return;
    }

    // Save token manually as extra safety
    localStorage.setItem('token', res.data.token);
    console.log('Token saved, verifying:', localStorage.getItem('token'));
    
    login(res.data.token);
    navigate('/admin');
  } catch (err) {
    console.error('Login failed:', err);
    setError('Invalid username or password');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-blue-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs md:max-w-md p-6 md:p-8">
        <div className="text-center mb-6 md:mb-8">
          <div className="text-4xl md:text-5xl mb-2">📦</div>
          <h1 className="text-2xl md:text-3xl font-bold text-blue-900">FINE Enterprises</h1>
          <p className="text-blue-400 mt-1 text-sm md:text-base">Order Tracking System</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-blue-900 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter username"
              className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl text-base md:text-lg focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-blue-900 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter password"
              className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl text-base md:text-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
              ❌ {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-base md:text-lg transition-all"
          >
            {loading ? 'Logging in...' : '🔐 Admin Login'}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 font-semibold py-3 rounded-xl text-sm md:text-base transition-all"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}