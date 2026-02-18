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
      login(res.data.token);
      navigate('/admin');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📦</div>
          <h1 className="text-3xl font-bold text-gray-800">FINE Enterprises</h1>
          <p className="text-gray-500 mt-1">Order Tracking System</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter username"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter password"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
              ❌ {error}
            </div>
          )}

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold py-4 rounded-xl text-lg transition-colors"
          >
            {loading ? 'Logging in...' : '🔐 Admin Login'}
          </button>

          {/* Back button */}
          <button
            onClick={() => navigate('/')}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-base transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}