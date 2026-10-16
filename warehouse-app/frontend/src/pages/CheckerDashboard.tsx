import { useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/index';
import { useLive } from '../lib/useLive';
import { deptLabel } from '../lib/dept';
import { useToast } from '../components/Toast';
import PersonSwitcher from '../components/PersonSwitcher';

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
  lines_short?: number;
  lines_unchecked?: number;
  line_count?: number;
}

interface CheckerData {
  checkerName: string;
  availableOrders: Order[];
  needSecondChecker: Order[];
  myOrders: Order[];
  myOrdersAsChecker2: Order[];
  doneOrders: Order[];
}
type ListKey = Exclude<keyof CheckerData, 'checkerName'>;

// Picker's notes from the digital sales order: items short or not ticked
function ShortNote({ o }: { o: Order }) {
  const link = (o.line_count || 0) > 0 && (
    <Link to={`/sheet/${o.id}`} className="inline-block mt-1 mb-2 text-sm font-semibold text-blue-600 underline underline-offset-2">
      📋 View items ({o.line_count})
    </Link>
  );
  if (!o.lines_short && !o.lines_unchecked) return link || null;
  return (<>
    {link}
    <p className="mt-1 mb-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold">
      ⚠ {o.lines_short ? `${o.lines_short} item${o.lines_short === 1 ? '' : 's'} picked short` : ''}
      {o.lines_short && o.lines_unchecked ? ' · ' : ''}
      {o.lines_unchecked ? `${o.lines_unchecked} not ticked by picker` : ''} — check carefully
    </p>
  </>);
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

  const toast = useToast();

  // Cached + refreshed every 8 s while the screen is visible
  const live = useLive<CheckerData>(`/checkers/${id}/orders`, 8000);
  const d = live.data;
  const availableOrders    = d?.availableOrders    ?? [];
  const needSecondChecker  = d?.needSecondChecker  ?? [];
  const myOrders           = d?.myOrders           ?? [];
  const myOrdersAsChecker2 = d?.myOrdersAsChecker2 ?? [];
  const doneOrders         = d?.doneOrders         ?? [];
  const checkerName        = d?.checkerName        ?? '';
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Modal state
  const [modalOrder, setModalOrder] = useState<{ id: string; so_number: string } | null>(null);

  // Move an order between lists instantly, then save; on failure reload the truth
  const act = async (orderId: string, from: ListKey, to: ListKey, patch: Partial<Order>,
                     path: string, label: string) => {
    if (busy.has(orderId)) return;
    setBusy(b => new Set(b).add(orderId));
    live.mutate(prev => {
      const order = prev[from].find(o => o.id === orderId);
      if (!order) return prev;
      return { ...prev, [from]: prev[from].filter(o => o.id !== orderId), [to]: [{ ...order, ...patch }, ...prev[to]] };
    });
    try {
      await api.patch(`/orders/${orderId}/${path}`, { checker_id: id });
      toast(label);
    } catch (err: any) {
      toast(`❌ ${err.response?.data?.error || 'Failed — please try again'}`);
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(orderId); return n; });
      live.refresh();
    }
  };

  // Checker clicks Start Checking → show modal
  const handleStartChecking = (order: Order) => {
    setModalOrder({ id: order.id, so_number: order.so_number });
  };

  // Modal: No — just start normally
  const handleModalNo = (orderId: string) => {
    setModalOrder(null);
    act(orderId, 'availableOrders', 'myOrders', { status: 'CHECKING', needs_second_checker: false },
        'start-checking', '🔍 Checking started');
  };

  // Modal: Yes — flag order as needing second checker, then start
  const handleModalYes = (orderId: string) => {
    setModalOrder(null);
    act(orderId, 'availableOrders', 'myOrders', { status: 'CHECKING', needs_second_checker: true },
        'start-checking-with-second', '🔍 Started — waiting for a 2nd checker');
  };

  const endChecking = (orderId: string) =>
    act(orderId, 'myOrders', 'doneOrders', { status: 'DONE' }, 'end-checking', '✅ Order completed');

  const startCheckingAsChecker2 = (orderId: string) =>
    act(orderId, 'needSecondChecker', 'myOrdersAsChecker2', {}, 'start-checking-2', '👥 Joined as 2nd checker');

  const endCheckingAsChecker2 = (orderId: string) =>
    act(orderId, 'myOrdersAsChecker2', 'doneOrders', { status: 'DONE' }, 'end-checking-2', '✅ Order completed');

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

        <PersonSwitcher role="checker" dept={dept} currentId={id} />

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300 text-sm">Checker Dashboard</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                👤 {checkerName || '…'}
              </h1>
              <p className="text-blue-400 text-sm mt-1">{deptLabel(dept)}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={live.refresh}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold w-12 h-12 rounded-xl text-xl transition-all"
              >
                ↻
              </button>
              <button
                onClick={() => navigate(`/checkers?dept=${dept}`)}
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

        {live.error && (
          <div className="bg-red-600/90 text-white px-4 py-3 rounded-xl mb-4 text-sm font-semibold text-center">⚠ {live.error}</div>
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
                  <ShortNote o={o} />
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
                    disabled={busy.has(o.id)}
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
                  <ShortNote o={o} />
                  {o.needs_second_checker && (
                    <p className="text-purple-600 text-sm mb-1">
                      2nd Checker: <span className="font-semibold">
                        {o.checker2_name || '⏳ Waiting for 2nd checker...'}
                      </span>
                    </p>
                  )}
                  <button
                    onClick={() => endChecking(o.id)}
                    disabled={busy.has(o.id)}
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
                  <ShortNote o={o} />
                  <p className="text-purple-600 text-sm mb-3">
                    1st Checker: <span className="font-semibold">{o.checker1_name || '—'}</span>
                  </p>
                  <button
                    onClick={() => endCheckingAsChecker2(o.id)}
                    disabled={busy.has(o.id)}
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
                  <ShortNote o={o} />
                  <button
                    onClick={() => handleStartChecking(o)}
                    disabled={busy.has(o.id)}
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