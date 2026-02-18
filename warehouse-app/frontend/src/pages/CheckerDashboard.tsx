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
  checker1_name?: string;
  checker2_name?: string;
  needs_second_checker?: boolean;
  checker2_id?: string;
  checker_id?: string;
}

// ── Confirmation Modal ──────────────────────────────────────────────
function Modal({
  orderId, soNumber, onYes, onNo
}: {
  orderId: string;
  soNumber: string;
  onYes: (id: string) => void;
  onNo: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">👥</div>
          <h2 className="text-xl font-bold text-blue-900">Additional Checker?</h2>
          <p className="text-blue-600 mt-2">
            Order <span className="font-bold">{soNumber}</span>
          </p>
          <p className="text-blue-500 text-sm mt-2">
            Do you need an additional checker for this order?
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNo(orderId)}
            className="flex-1 bg-blue-100 hover:bg-blue-200 active:scale-95 text-blue-800 font-bold py-4 rounded-xl text-base transition-all"
          >
            No, just me
          </button>
          <button
            onClick={() => onYes(orderId)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 rounded-xl text-base transition-all"
          >
            Yes, need 2nd
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────
export default function CheckerDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const dept = searchParams.get('dept') || 'machinery';
  const navigate = useNavigate();

  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [needSecondChecker, setNeedSecondChecker] = useState<Order[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myOrdersAsChecker2, setMyOrdersAsChecker2] = useState<Order[]>([]);
  const [doneOrders, setDoneOrders] = useState<Order[]>([]);
  const [checkerName, setCheckerName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modalOrder, setModalOrder] = useState<{ id: string; so_number: string } | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchData = async () => {
  try {
    const res = await api.get(`/checkers/${id}/orders`);
    const data = res.data;
    console.log('Checker API response:', data); // see exact keys returned
    setCheckerName(data.checkerName || '');
    setAvailableOrders(data.availableOrders || []);
    setNeedSecondChecker(data.needSecondChecker || []);
    setMyOrders(data.myOrders || []);
    setMyOrdersAsChecker2(data.myOrdersAsChecker2 || []);
    setDoneOrders(data.doneOrders || []);
  } catch (err) {
    console.error('fetchData error:', err);
  }
};

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  // Checker clicks Start Checking → show modal
  const handleStartChecking = (order: Order) => {
    setModalOrder({ id: order.id, so_number: order.so_number });
  };

  // Modal: No — just start normally
  const handleModalNo = async (orderId: string) => {
    setModalOrder(null);
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/start-checking`, { checker_id: id });
      showMsg('✅ Checking started!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to start'}`);
    } finally { setLoading(false); }
  };

  // Modal: Yes — flag order as needing second checker, then start
  const handleModalYes = async (orderId: string) => {
    setModalOrder(null);
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/start-checking-with-second`, { checker_id: id });
      showMsg('✅ Checking started! Order is now visible for a 2nd checker.');
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

  const startCheckingAsChecker2 = async (orderId: string) => {
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/start-checking-2`, { checker_id: id });
      showMsg('✅ Joined as 2nd checker!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to join'}`);
    } finally { setLoading(false); }
  };

  const endCheckingAsChecker2 = async (orderId: string) => {
    setLoading(true);
    try {
      await api.patch(`/orders/${orderId}/end-checking-2`, { checker_id: id });
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

        {/* Modal */}
        {modalOrder && (
          <Modal
            orderId={modalOrder.id}
            soNumber={modalOrder.so_number}
            onYes={handleModalYes}
            onNo={handleModalNo}
          />
        )}

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
            <div className="flex flex-col gap-2">
              <button
                onClick={fetchData}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold w-12 h-12 rounded-xl text-xl transition-all"
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
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{availableOrders.length}</div>
              <div className="text-blue-300 text-xs mt-1">Ready</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-purple-300">{needSecondChecker.length}</div>
              <div className="text-blue-300 text-xs mt-1">Need 2nd</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-yellow-300">{myOrders.length + myOrdersAsChecker2.length}</div>
              <div className="text-blue-300 text-xs mt-1">Checking</div>
            </div>
            <div className="bg-blue-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-green-300">{doneOrders.length}</div>
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

        {/* ── Orders Needing 2nd Checker ── */}
        {needSecondChecker.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
              👥 Needs 2nd Checker
              <span className="bg-purple-500 text-white text-sm px-2 py-0.5 rounded-full">
                {needSecondChecker.length}
              </span>
            </h2>
            <div className="space-y-3">
              {needSecondChecker.map(o => (
                <div key={o.id} className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-900 text-xl">{o.so_number}</span>
                    <div className="flex gap-2">
                      <SizeTag size={o.size} />
                      <DeliveryTag type={o.delivery_type} />
                    </div>
                  </div>
                  <p className="text-blue-500 text-sm">
                    Picked by: <span className="font-semibold">{o.picker_name || '—'}</span>
                  </p>
                  <p className="text-purple-600 text-sm mb-3">
                    1st Checker: <span className="font-semibold">{o.checker1_name || '—'}</span>
                  </p>
                  <div className="bg-purple-100 rounded-xl px-3 py-2 mb-3 text-center">
                    <p className="text-purple-700 text-sm font-bold">
                      🔔 This order requires a 2nd checker — that's you!
                    </p>
                  </div>
                  <button
                    onClick={() => startCheckingAsChecker2(o.id)}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:bg-purple-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    👥 Join as 2nd Checker
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Currently Checking as Checker 1 ── */}
        {myOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">🔍 You Are Checking</h2>
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
                  <p className="text-blue-500 text-sm">
                    Picked by: <span className="font-semibold">{o.picker_name || '—'}</span>
                  </p>
                  {o.needs_second_checker && (
                    <p className="text-purple-600 text-sm mb-1">
                      2nd Checker: <span className="font-semibold">
                        {o.checker2_name || '⏳ Waiting for 2nd checker...'}
                      </span>
                    </p>
                  )}
                  <button
                    onClick={() => endChecking(o.id)}
                    disabled={loading}
                    className="w-full mt-3 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    ✅ Finish Checking
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Currently Checking as Checker 2 ── */}
        {myOrdersAsChecker2.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">👥 You Are 2nd Checker</h2>
            <div className="space-y-3">
              {myOrdersAsChecker2.map(o => (
                <div key={o.id} className="bg-purple-50 border-2 border-purple-400 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-900 text-xl">{o.so_number}</span>
                    <div className="flex gap-2">
                      <SizeTag size={o.size} />
                      <DeliveryTag type={o.delivery_type} />
                    </div>
                  </div>
                  <p className="text-blue-500 text-sm">
                    Picked by: <span className="font-semibold">{o.picker_name || '—'}</span>
                  </p>
                  <p className="text-purple-600 text-sm mb-3">
                    1st Checker: <span className="font-semibold">{o.checker1_name || '—'}</span>
                  </p>
                  <button
                    onClick={() => endCheckingAsChecker2(o.id)}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:bg-purple-300 text-white font-bold py-4 rounded-xl text-base transition-all"
                  >
                    ✅ Finish Checking (2nd)
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Available Orders ── */}
        <div className="mb-6">
          <h2 className="text-white font-bold text-lg mb-3">
            📦 Ready to Check
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
              <p className="text-blue-400 text-sm mt-1">Orders appear here once pickers finish</p>
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
                    onClick={() => handleStartChecking(o)}
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

        {/* ── Done Today ── */}
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