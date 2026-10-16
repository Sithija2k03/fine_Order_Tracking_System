import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
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
  customer_name?: string | null;
  line_count?: number;
  lines_done?: number;
  lines_short?: number;
}

export default function PickerDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const dept = searchParams.get('dept') || 'machinery';
  const navigate = useNavigate();

  const toast = useToast();

  // Cached + auto-refreshing every 10 s, so new assignments appear on their own
  const live = useLive<{ pickerName: string; orders: Order[] }>(`/pickers/${id}/orders`, 10000);
  const orders = live.data?.orders ?? [];
  const pickerName = live.data?.pickerName ?? '';
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Status changes show instantly; the server call runs behind it
  const act = async (orderId: string, path: string, next: string, prev: string, label: string) => {
    if (busy.has(orderId)) return;
    setBusy(b => new Set(b).add(orderId));
    live.mutate(d => ({ ...d, orders: d.orders.map(o => (o.id === orderId ? { ...o, status: next } : o)) }));
    try {
      await api.patch(`/orders/${orderId}/${path}`, { picker_id: id });
      toast(label);
      return true;
    } catch (err: any) {
      live.mutate(d => ({ ...d, orders: d.orders.map(o => (o.id === orderId ? { ...o, status: prev } : o)) }));
      toast(`❌ ${err.response?.data?.error || 'Failed — please try again'}`);
      return false;
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(orderId); return n; });
      live.refresh();
    }
  };
  const openSheet = (orderId: string) => navigate(`/picker/${id}/pick/${orderId}?dept=${dept}`);
  // Start picking → straight into the digital sales order when it has an item list
  const startPicking = async (orderId: string) => {
    const ok = await act(orderId, 'start-picking', 'PICKING', 'ASSIGNED', '🚀 Picking started');
    if (ok) openSheet(orderId);    // always pop up the digital sales order
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

        <PersonSwitcher role="picker" dept={dept} currentId={id} />

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300 text-sm">Picker Dashboard</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                👤 {pickerName || '…'}
              </h1>
              <p className="text-blue-400 text-sm mt-1">{deptLabel(dept)}</p>
            </div>
            <div className="text-right">
              <button
                onClick={live.refresh}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold w-12 h-12 rounded-xl text-xl transition-all mb-2 block ml-auto"
              >
                ↻
              </button>
              <button
                onClick={() => navigate(`/pickers?dept=${dept}`)}
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

        {live.error && (
          <div className="bg-red-600/90 text-white px-4 py-3 rounded-xl mb-4 text-sm font-semibold text-center">⚠ {live.error}</div>
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
                  {o.customer_name && <p className="text-blue-700 text-sm -mt-2 mb-3 truncate">{o.customer_name}</p>}
                  {(o.line_count || 0) > 0 && (
                      <div className="flex items-center gap-2 mb-2 text-sm">
                        <div className="flex-1 h-2.5 bg-yellow-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 transition-all"
                            style={{ width: `${Math.round(((o.lines_done || 0) / (o.line_count || 1)) * 100)}%` }} />
                        </div>
                        <span className="font-bold text-blue-900 shrink-0">{o.lines_done || 0}/{o.line_count} items</span>
                      </div>
                  )}
                  <button onClick={() => openSheet(o.id)}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 rounded-xl text-base transition-all">
                    📋 Open sales order
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
                  {(
                    <div className="flex items-center justify-between gap-2 -mt-2 mb-3 text-sm">
                      <span className="text-blue-700 truncate">{o.customer_name}</span>
                      <button onClick={() => openSheet(o.id)} className="shrink-0 text-blue-600 font-semibold underline underline-offset-2">
                        {(o.line_count || 0) > 0 ? `${o.line_count} item${o.line_count === 1 ? '' : 's'} · view` : 'view order'}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => startPicking(o.id)}
                    disabled={busy.has(o.id)}
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
        {live.loading && <div className="h-32 rounded-2xl bg-blue-900/60 animate-pulse" />}

        {!live.loading && orders.length === 0 && (
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