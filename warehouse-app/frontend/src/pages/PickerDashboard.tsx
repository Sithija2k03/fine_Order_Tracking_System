import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/index';

interface Order {
  id: string;
  so_number: string;
  status: string;
  size: string;
  delivery_type: string;
}

export default function PickerDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const dept = searchParams.get('dept') || 'machinery';
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [pickerName, setPickerName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const res = await api.get(`/pickers/${id}/orders`);
      setPickerName(res.data.pickerName);
      setOrders(res.data.orders);
    } catch (err) { console.error(err); }
  };

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const startPicking = async (orderId: string) => {
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/start-picking`, { picker_id: id });
      showMsg('✅ Picking started!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to start'}`);
    } finally { setLoading(false); }
  };

  const endPicking = async (orderId: string) => {
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/end-picking`, { picker_id: id });
      showMsg('✅ Picking completed!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to end'}`);
    } finally { setLoading(false); }
  };

  const assigned = orders.filter(o => o.status === 'ASSIGNED');
  const picking  = orders.filter(o => o.status === 'PICKING');
  const done     = orders.filter(o => ['PICKED', 'CHECKING', 'DONE'].includes(o.status));

  const SizeTag = ({ size }: { size: string }) => (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold
      ${size === 'S' ? 'bg-blue-100 text-blue-700' :
        size === 'M' ? 'bg-blue-200 text-blue-800' :
        'bg-blue-300 text-blue-900'}`}>
      {size}
    </span>
  );

  const DeliveryTag = ({ type }: { type: string }) => (
    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-200">
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
              <p className="text-blue-300 text-sm">Picker Dashboard</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                👤 {pickerName}
              </h1>
              <p className="text-blue-400 text-sm mt-1 capitalize">{dept} Department</p>
            </div>
            <div className="text-right">
              <button
                onClick={fetchData}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold w-12 h-12 rounded-xl text-xl transition-all mb-2 block ml-auto"
              >
                ↻
              </button>
              <button
                onClick={() => navigate(`/pickers`)}
                className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-blue-200 text-sm font-semibold px-3 py-2 rounded-xl transition-all"
              >
                ← Back
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{assigned.length}</div>
              <div className="text-blue-300 text-xs mt-1">Assigned</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-yellow-300">{picking.length}</div>
              <div className="text-blue-300 text-xs mt-1">In Progress</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-300">{done.length}</div>
              <div className="text-blue-300 text-xs mt-1">Completed</div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="bg-blue-100 text-blue-900 px-4 py-3 rounded-xl mb-4 font-medium text-center">
            {message}
          </div>
        )}

        {/* Currently Picking */}
        {picking.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">🔄 Currently Picking</h2>
            <div className="space-y-3">
              {picking.map(o => (
                <div key={o.id} className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-blue-900 text-xl">{o.so_number}</span>
                    <div className="flex gap-2">
                      <SizeTag size={o.size} />
                      <DeliveryTag type={o.delivery_type} />
                    </div>
                  </div>
                  <button
                    onClick={() => endPicking(o.id)}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    ✅ Finish Picking
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assigned Orders */}
        {assigned.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">📋 Assigned Orders</h2>
            <div className="space-y-3">
              {assigned.map(o => (
                <div key={o.id} className="bg-white rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-blue-900 text-xl">{o.so_number}</span>
                    <div className="flex gap-2">
                      <SizeTag size={o.size} />
                      <DeliveryTag type={o.delivery_type} />
                    </div>
                  </div>
                  <button
                    onClick={() => startPicking(o.id)}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    🚀 Start Picking
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Orders */}
        {done.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">✅ Completed Today</h2>
            <div className="space-y-2">
              {done.map(o => (
                <div key={o.id} className="bg-blue-900 rounded-2xl p-4 flex items-center justify-between">
                  <span className="font-bold text-white">{o.so_number}</span>
                  <div className="flex gap-2 items-center">
                    <SizeTag size={o.size} />
                    <DeliveryTag type={o.delivery_type} />
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold
                      ${o.status === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-blue-200 text-blue-800'}`}>
                      {o.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No orders */}
        {orders.length === 0 && (
          <div className="bg-blue-900 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-3">⏳</div>
            <p className="text-blue-300 text-lg">No orders assigned yet</p>
            <p className="text-blue-400 text-sm mt-1">Check back soon</p>
          </div>
        )}

      </div>
    </div>
  );
}