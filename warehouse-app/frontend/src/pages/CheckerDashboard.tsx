import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/index';

interface Order {
  id: string;
  so_number: string;
  status: string;
  size: string;
  delivery_type: string;
  picker_name: string;
}

export default function CheckerDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const dept = searchParams.get('dept') || 'machinery';
  const navigate = useNavigate();

  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [doneOrders, setDoneOrders] = useState<Order[]>([]);
  const [checkerName, setCheckerName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { 
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchData = async () => {
    try {
      const res = await api.get(`/checkers/${id}/orders`);
      setCheckerName(res.data.checkerName);
      setAvailableOrders(res.data.availableOrders);
      setMyOrders(res.data.myOrders);
      setDoneOrders(res.data.doneOrders);
    } catch (err) { console.error(err); }
  };

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const startChecking = async (orderId: string) => {
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/start-checking`, { checker_id: id });
      showMsg('✅ Checking started!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to start'}`);
    } finally { setLoading(false); }
  };

  const endChecking = async (orderId: string) => {
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/end-checking`, { checker_id: id });
      showMsg('✅ Order completed!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to end'}`);
    } finally { setLoading(false); }
  };

  const SizeTag = ({ size }: { size: string }) => (
    <span className={`px-2 py-1 rounded-lg text-xs font-bold
      ${size === 'S' ? 'bg-blue-100 text-blue-700' :
        size === 'M' ? 'bg-blue-200 text-blue-800' :
        'bg-blue-300 text-blue-900'}`}>
      {size}
    </span>
  );

  const DeliveryTag = ({ type }: { type: string }) => (
    <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-200">
      {type}
    </span>
  );

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300 text-sm">Checker Dashboard</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                👤 {checkerName}
              </h1>
              <p className="text-blue-400 text-sm mt-1 capitalize">{dept} Department</p>
            </div>
            <div className="text-right flex flex-col gap-2">
              <button
                onClick={fetchData}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold w-12 h-12 rounded-xl text-xl transition-all block ml-auto"
              >
                ↻
              </button>
              <button
                onClick={() => navigate('/checkers')}
                className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-blue-200 text-sm font-semibold px-3 py-2 rounded-xl transition-all"
              >
                ← Back
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{availableOrders.length}</div>
              <div className="text-blue-300 text-xs mt-1">Ready</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-yellow-300">{myOrders.length}</div>
              <div className="text-blue-300 text-xs mt-1">Checking</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-300">{doneOrders.length}</div>
              <div className="text-blue-300 text-xs mt-1">Done</div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="bg-blue-100 text-blue-900 px-4 py-3 rounded-xl mb-4 font-medium text-center">
            {message}
          </div>
        )}

        {/* Currently Checking */}
        {myOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">🔍 Currently Checking</h2>
            <div className="space-y-3">
              {myOrders.map(o => (
                <div key={o.id} className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-900 text-xl">{o.so_number}</span>
                    <div className="flex gap-2">
                      <SizeTag size={o.size} />
                      <DeliveryTag type={o.delivery_type} />
                    </div>
                  </div>
                  <p className="text-blue-500 text-sm mb-3">
                    Picked by: <span className="font-semibold">{o.picker_name || '—'}</span>
                  </p>
                  <button
                    onClick={() => endChecking(o.id)}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    ✅ Finish Checking
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available - Picked orders ready for checking */}
        <div className="mb-6">
          <h2 className="text-white font-bold text-lg mb-3">
            📦 Completed Picking — Ready to Check
            {availableOrders.length > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-sm px-2 py-0.5 rounded-full">
                {availableOrders.length}
              </span>
            )}
          </h2>

          {availableOrders.length === 0 ? (
            <div className="bg-blue-900 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-2">⏳</div>
              <p className="text-blue-300">No orders ready for checking yet</p>
              <p className="text-blue-400 text-sm mt-1">
                Orders will appear here once pickers finish
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableOrders.map(o => (
                <div key={o.id} className="bg-white rounded-2xl p-4 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-900 text-xl">{o.so_number}</span>
                    <div className="flex gap-2">
                      <SizeTag size={o.size} />
                      <DeliveryTag type={o.delivery_type} />
                    </div>
                  </div>
                  <p className="text-blue-500 text-sm mb-3">
                    Picked by: <span className="font-semibold text-blue-700">{o.picker_name || '—'}</span>
                  </p>
                  <button
                    onClick={() => startChecking(o.id)}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    🔍 Start Checking
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Orders Today */}
        {doneOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">✅ Completed Today</h2>
            <div className="space-y-2">
              {doneOrders.map(o => (
                <div key={o.id} className="bg-blue-900 rounded-2xl p-4 flex items-center justify-between">
                  <span className="font-bold text-white">{o.so_number}</span>
                  <div className="flex gap-2 items-center">
                    <SizeTag size={o.size} />
                    <DeliveryTag type={o.delivery_type} />
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-lg text-xs font-bold">
                      DONE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}