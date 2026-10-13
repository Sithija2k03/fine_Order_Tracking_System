import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/index';
import UploadOrdersModal from './UploadOrdersModal';
import { useLive } from '../../lib/useLive';
import { deptLabel as labelFor } from '../../lib/dept';
import { useToast } from '../../components/Toast';

interface Order {
  id: string;
  so_number: string;
  status: string;
  size: string;
  delivery_type: string;
  picker_id: string | null;
  picker_name: string;
  checker_name: string;
  checker2_name: string;
  needs_second_checker: boolean;
  picker_start: string;
  picker_end: string;
  checker_start: string;
  checker_end: string;
  picking_time: string;
  idle_time: string;
  checking_time: string;
  total_time: string;
  created_at: string;
  approved: boolean;
  approved_by_name: string;
  approved_at: string;
}

interface Picker { id: string; name: string; }

const STATUS_COLORS: Record<string, string> = {
  UNASSIGNED: 'bg-blue-100 text-blue-700',
  ASSIGNED:   'bg-blue-200 text-blue-800',
  PICKING:    'bg-yellow-100 text-yellow-700',
  PICKED:     'bg-blue-300 text-blue-900',
  CHECKING:   'bg-indigo-100 text-indigo-700',
  DONE:       'bg-green-100 text-green-700',
};

const ASSIGNABLE = ['UNASSIGNED', 'ASSIGNED'];
const NO_ORDERS: Order[] = [];
const NO_PICKERS: Picker[] = [];

// Stat cards double as filters — tap one to show only those orders
const FILTERS = [
  { key: 'all',        label: 'Total',           color: 'text-white',      test: () => true },
  { key: 'unassigned', label: 'Unassigned',      color: 'text-blue-300',   test: (o: Order) => o.status === 'UNASSIGNED' },
  { key: 'progress',   label: 'In Progress',     color: 'text-yellow-300', test: (o: Order) => ['ASSIGNED', 'PICKING'].includes(o.status) },
  { key: 'picked',     label: 'Picked',          color: 'text-cyan-300',   test: (o: Order) => ['PICKED', 'CHECKING'].includes(o.status) },
  { key: 'done',       label: 'Done',            color: 'text-green-300',  test: (o: Order) => o.status === 'DONE' },
  { key: 'approval',   label: 'Pending Approval', color: 'text-orange-300', test: (o: Order) => ['PICKED', 'DONE'].includes(o.status) && !o.approved },
] as const;
type FilterKey = typeof FILTERS[number]['key'];

export default function OrdersPage() {
  const { department } = useParams<{ department: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const dept = department || 'machinery';
  const deptLabel = labelFor(dept);

  const today = new Date().toISOString().split('T')[0];

  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [loading, setLoading]         = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUpload, setShowUpload]   = useState(false);
  const [date, setDate]               = useState(today);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkPicker, setBulkPicker]   = useState('');

  const [soNumber, setSoNumber]         = useState('');
  const [size, setSize]                 = useState('');
  const [deliveryType, setDeliveryType] = useState('');
  const [pickerId, setPickerId]         = useState('');

  // Orders refresh every 15 s while the screen is open; pickers come from cache
  const ordersLive  = useLive<Order[]>(`/orders?department=${dept}&date=${date}`, 15000);
  const pickersLive = useLive<Picker[]>(`/pickers?department=${dept}`);
  const orders  = ordersLive.data  ?? NO_ORDERS;
  const pickers = pickersLive.data ?? NO_PICKERS;
  const pickerName = (id: string) => pickers.find(p => p.id === id)?.name || '';

  const patchOrders = (ids: string[], patch: Partial<Order>) =>
    ordersLive.mutate(list => list.map(o => (ids.includes(o.id) ? { ...o, ...patch } : o)));

  // ── Add one order manually ──
  const addOrder = async () => {
    if (!soNumber.trim() || !size || !deliveryType) {
      toast('❌ Please fill SO Number, Size and Delivery Type');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/orders', {
        so_number: soNumber.trim().toUpperCase(),
        size, delivery_type: deliveryType, department: dept
      });
      if (pickerId) await api.patch(`/orders/${res.data.id}/assign`, { picker_id: pickerId });
      setSoNumber(''); setSize(''); setDeliveryType(''); setPickerId('');
      setShowAddForm(false);
      toast('✅ Order added');
      ordersLive.refresh();
    } catch (err: any) {
      toast(`❌ ${err.response?.data?.error || 'Failed to add order'}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Assign one order — updates the screen instantly, saves in the background ──
  const assignPicker = async (order: Order, pid: string) => {
    if (!pid || pid === order.picker_id) return;
    const before = { picker_id: order.picker_id, picker_name: order.picker_name, status: order.status };
    patchOrders([order.id], { picker_id: pid, picker_name: pickerName(pid), status: 'ASSIGNED' });
    try {
      await api.patch(`/orders/${order.id}/assign`, { picker_id: pid });
    } catch (err: any) {
      patchOrders([order.id], before);
      toast(`❌ ${order.so_number}: ${err.response?.data?.error || 'Failed to assign'}`);
    }
  };

  // ── Assign many orders at once ──
  const assignSelected = async () => {
    const ids = [...selected];
    if (!bulkPicker || !ids.length) return;
    const pid = bulkPicker;
    const name = pickerName(pid);
    const snapshot = orders.filter(o => ids.includes(o.id));
    patchOrders(ids, { picker_id: pid, picker_name: name, status: 'ASSIGNED' });
    setSelected(new Set());
    try {
      const res = await api.patch('/orders/assign-bulk', { order_ids: ids, picker_id: pid });
      toast(`✅ ${res.data.updated} order${res.data.updated === 1 ? '' : 's'} → ${name}`, {
        action: { label: '✍️ Get signature', onClick: () => navigate(`/admin/${dept}/signoff?picker=${pid}&date=${date}`) },
      });
      if (res.data.skipped) ordersLive.refresh();
    } catch (err: any) {
      ordersLive.mutate(list => list.map(o => snapshot.find(s => s.id === o.id) || o));
      toast(`❌ ${err.response?.data?.error || 'Failed to assign'}`);
    }
  };

  const deleteOrder = async (order: Order) => {
    if (!ASSIGNABLE.includes(order.status)) {
      toast('❌ Cannot delete an order that has started picking');
      return;
    }
    if (!confirm(`Delete ${order.so_number}?`)) return;
    ordersLive.mutate(list => list.filter(o => o.id !== order.id));
    try {
      await api.delete(`/orders/${order.id}`);
    } catch {
      toast('❌ Failed to delete order');
      ordersLive.refresh();
    }
  };

  const approveOrder = async (order: Order) => {
    if (order.approved) return;
    if (!confirm(`Approve ${order.so_number}?`)) return;
    patchOrders([order.id], { approved: true });
    try {
      await api.patch(`/orders/${order.id}/approve`, {});
      ordersLive.refresh();
    } catch (err: any) {
      patchOrders([order.id], { approved: false });
      toast(`❌ ${err.response?.data?.error || 'Failed to approve'}`);
    }
  };

  const exportOrders = async () => {
    try {
      const res = await api.get(`/orders/export?date=${date}&department=${dept}`);
      const rows = res.data;
      if (!rows.length) { toast('❌ No orders to export for this date'); return; }
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map((r: any) => headers.map(h => `"${r[h] ?? ''}"`).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Orders_${dept}_${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('❌ Export failed');
    }
  };

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!;
    const q = search.trim().toLowerCase();
    return orders.filter(o => f.test(o) && (!q || o.so_number.toLowerCase().includes(q)));
  }, [orders, filter, search]);

  const selectableVisible = filtered.filter(o => ASSIGNABLE.includes(o.status));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(o => selected.has(o.id));

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllVisible = () => setSelected(prev => {
    const next = new Set(prev);
    selectableVisible.forEach(o => (allVisibleSelected ? next.delete(o.id) : next.add(o.id)));
    return next;
  });

  // Plain render helper (not a component) so a background refresh never closes an open dropdown
  const pickerSelect = (order: Order, className: string) => (
    <select value={order.picker_id || ''} onChange={e => assignPicker(order, e.target.value)} className={className}>
      <option value="" disabled>Assign…</option>
      {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/admin/${dept}`)}
                className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-white font-semibold px-3 py-2.5 md:px-4 md:py-3 rounded-xl text-sm md:text-base shrink-0 whitespace-nowrap transition-all"
              >
                ←
              </button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{deptLabel} — Orders</h1>
                <p className="text-blue-300 text-sm mt-1">
                  {orders.length} orders · {date === today ? 'Today' : date}
                  {ordersLive.error && <span className="text-red-300"> · ⚠ {ordersLive.error}</span>}
                </p>
              </div>
            </div>

            <div className="flex flex-nowrap md:flex-wrap gap-2 items-center overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
              <input
                type="date" value={date} onChange={e => { setDate(e.target.value); setSelected(new Set()); }}
                className="shrink-0 px-3 py-2 bg-blue-800 text-white border border-blue-600 rounded-xl text-sm focus:outline-none cursor-pointer"
              />
              {date !== today && (
                <button onClick={() => setDate(today)}
                  className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-blue-200 text-xs font-semibold px-3 py-2 rounded-xl transition-all">
                  Today
                </button>
              )}
              <button onClick={() => setShowUpload(true)}
                className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl text-sm md:text-base shrink-0 whitespace-nowrap transition-all">
                📤 Upload
              </button>
              <button onClick={() => navigate(`/admin/${dept}/signoff?date=${date}`)}
                className="bg-white hover:bg-blue-50 active:scale-95 text-blue-900 font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl text-sm md:text-base shrink-0 whitespace-nowrap transition-all">
                ✍️ Sign-off
              </button>
              <button onClick={() => setShowAddForm(!showAddForm)}
                className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-blue-100 font-semibold px-3 py-2.5 md:px-4 md:py-3 rounded-xl text-sm md:text-base shrink-0 whitespace-nowrap transition-all"
                title="Add a single order manually">
                + Add
              </button>
              <button onClick={exportOrders}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl text-sm md:text-base shrink-0 whitespace-nowrap transition-all">
                📥 Export
              </button>
              <button onClick={() => navigate(`/admin/${dept}/approved`)}
                className="bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl text-sm md:text-base shrink-0 whitespace-nowrap transition-all">
                ✅ Approved
              </button>
            </div>
          </div>
        </div>

        {/* Stats = filters */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4">
          {FILTERS.map(f => {
            const active = filter === f.key;
            const isApproval = f.key === 'approval';
            return (
              <button key={f.key} onClick={() => setFilter(active && f.key !== 'all' ? 'all' : f.key)}
                className={`rounded-2xl p-3 md:p-4 text-center transition-all active:scale-95
                  ${isApproval ? 'bg-orange-900' : 'bg-blue-900'}
                  ${active ? 'ring-2 ring-blue-300' : 'hover:brightness-110'}`}>
                <div className={`text-xl md:text-3xl font-bold ${f.color}`}>{orders.filter(f.test).length}</div>
                <div className={`text-[11px] md:text-xs mt-1 font-medium ${isApproval ? 'text-orange-400' : 'text-blue-300'}`}>{f.label}</div>
              </button>
            );
          })}
        </div>

        {/* Upload Sales Order Report */}
        {showUpload && (
          <UploadOrdersModal
            department={dept}
            pickers={pickers}
            onClose={() => setShowUpload(false)}
            onImported={(msg) => {
              setShowUpload(false);
              if (date !== today) setDate(today);   // imported orders are created today
              else ordersLive.refresh();
              toast(msg);
            }}
          />
        )}

        {/* Add Order Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl p-4 md:p-6 mb-4">
            <h2 className="text-lg font-bold text-blue-900 mb-4">➕ Add New Order</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">SO Number *</label>
                <input type="text" value={soNumber} onChange={e => setSoNumber(e.target.value)}
                  placeholder="e.g. SO-1001"
                  className="w-full px-3 py-3 border-2 border-blue-100 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">Size *</label>
                <select value={size} onChange={e => setSize(e.target.value)}
                  className="w-full px-3 py-3 border-2 border-blue-100 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select Size</option>
                  <option value="S">S — Small</option>
                  <option value="M">M — Medium</option>
                  <option value="L">L — Large</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">Delivery Type *</label>
                <select value={deliveryType} onChange={e => setDeliveryType(e.target.value)}
                  className="w-full px-3 py-3 border-2 border-blue-100 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select Type</option>
                  <option value="Giving">Giving</option>
                  <option value="Transport">Transport</option>
                  <option value="Pronto">Pronto</option>
                  <option value="Guard-Room">Guard Room</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">Assign Picker (optional)</label>
                <select value={pickerId} onChange={e => setPickerId(e.target.value)}
                  className="w-full px-3 py-3 border-2 border-blue-100 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Assign later</option>
                  {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={addOrder} disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all">
                {loading ? 'Adding...' : '✅ Add Order'}
              </button>
              <button onClick={() => setShowAddForm(false)}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-6 py-3 rounded-xl text-sm transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search + select all */}
        <div className="mb-3 flex flex-wrap gap-2 items-center">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search SO number..."
            className="flex-1 min-w-[12rem] md:flex-none md:w-72 px-4 py-3 bg-blue-900 text-white placeholder-blue-400 border-2 border-blue-700 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
          {selectableVisible.length > 0 && (
            <button onClick={toggleAllVisible}
              className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-blue-100 font-semibold px-4 py-3 rounded-xl text-sm transition-all">
              {allVisibleSelected ? '☐ Clear selection' : `☑ Select ${selectableVisible.length} to assign`}
            </button>
          )}
        </div>

        {ordersLive.loading && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-blue-900/60 animate-pulse" />)}
          </div>
        )}

        {/* Desktop Table */}
        {!ordersLive.loading && (
        <div className="hidden md:block bg-white rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="pl-4 py-3 w-8">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                      disabled={!selectableVisible.length} className="w-4 h-4 accent-blue-300" title="Select all assignable" />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">SO #</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Size</th>
                  <th className="px-4 py-3 text-left font-semibold">Delivery</th>
                  <th className="px-4 py-3 text-left font-semibold">Picker</th>
                  <th className="px-4 py-3 text-left font-semibold">Pick Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Idle Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Checker 1</th>
                  <th className="px-4 py-3 text-left font-semibold">Checker 2</th>
                  <th className="px-4 py-3 text-left font-semibold">Check Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Total</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={13} className="text-center py-8 text-blue-300">No orders found</td></tr>
                ) : filtered.map((o, i) => {
                  const assignable = ASSIGNABLE.includes(o.status);
                  const isSel = selected.has(o.id);
                  return (
                  <tr key={o.id} className={isSel ? 'bg-blue-100' : i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                    <td className="pl-4 py-3">
                      {assignable && (
                        <input type="checkbox" checked={isSel} onChange={() => toggle(o.id)} className="w-4 h-4 accent-blue-600" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-900">{o.so_number}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{o.size || '—'}</td>
                    <td className="px-4 py-3 text-blue-700">{o.delivery_type || '—'}</td>
                    <td className="px-4 py-3">
                      {assignable ? (
                        pickerSelect(o, "border border-blue-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500")
                      ) : (
                        <span className="text-blue-800 font-medium">{o.picker_name || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-blue-600 font-mono text-xs">{o.picking_time || '—'}</td>
                    <td className="px-4 py-3 text-orange-600 font-mono text-xs">{o.idle_time || '—'}</td>
                    <td className="px-4 py-3 text-blue-800 font-medium">{o.checker_name || '—'}</td>
                    <td className="px-4 py-3">
                      {o.needs_second_checker ? (
                        o.checker2_name ? (
                          <span className="text-purple-700 font-medium">{o.checker2_name}</span>
                        ) : (
                          <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap">
                            ⏳ Waiting...
                          </span>
                        )
                      ) : (
                        <span className="text-blue-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-blue-600 font-mono text-xs">{o.checking_time || '—'}</td>
                    <td className="px-4 py-3 text-blue-900 font-mono text-xs font-bold">{o.total_time || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {assignable && (
                          <button onClick={() => deleteOrder(o)}
                            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white p-2 rounded-lg transition-all" title="Delete order">
                            <TrashIcon size={16} />
                          </button>
                        )}
                        {['PICKED','DONE'].includes(o.status) && !o.approved && (
                          <button onClick={() => approveOrder(o)}
                            className="bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold px-2 py-1 rounded-lg text-xs transition-all whitespace-nowrap">
                            ⏳ Pending Approval
                          </button>
                        )}
                        {o.approved && (
                          <span className="bg-green-100 text-green-700 font-bold px-2 py-1 rounded-lg text-xs whitespace-nowrap">
                            ✅ {o.approved_by_name ? `Approved · ${o.approved_by_name}` : 'Approved'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Mobile Cards */}
        {!ordersLive.loading && (
        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center text-blue-300 py-8">No orders found</div>
          ) : filtered.map(o => {
            const assignable = ASSIGNABLE.includes(o.status);
            const isSel = selected.has(o.id);
            return (
            <div key={o.id} className={`bg-white rounded-2xl p-3 transition-all ${isSel ? 'ring-4 ring-blue-400' : ''}`}>
              <div className="flex items-center gap-3">
                {assignable && (
                  <button onClick={() => toggle(o.id)} aria-label="Select order"
                    className={`w-8 h-8 shrink-0 rounded-lg border-2 flex items-center justify-center text-sm font-bold
                      ${isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-blue-200 text-transparent'}`}>
                    ✓
                  </button>
                )}
                <div className="flex-1 min-w-0" onClick={() => assignable && toggle(o.id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-900 text-base truncate">{o.so_number}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                  </div>
                  <div className="text-xs text-blue-500 mt-0.5">
                    {o.size || '—'} · {o.delivery_type || '—'}
                    {!assignable && o.picker_name && <> · 🧳 {o.picker_name}</>}
                  </div>
                </div>
                {assignable && (
                  <button onClick={() => deleteOrder(o)} aria-label="Delete order"
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg shrink-0">
                    <TrashIcon size={18} />
                  </button>
                )}
              </div>

              {assignable && (
                pickerSelect(o, `mt-2 w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none
                    ${o.picker_id ? 'border-blue-200 bg-blue-50 text-blue-900 font-semibold' : 'border-orange-300 bg-orange-50 text-orange-800'}`)
              )}

              {!assignable && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-blue-700 mt-2">
                  <div><span className="font-semibold">Checker 1:</span> {o.checker_name || '—'}</div>
                  {o.needs_second_checker && (
                    <div><span className="font-semibold">Checker 2:</span>{' '}
                      {o.checker2_name ? <span className="text-purple-700">{o.checker2_name}</span> : <span className="text-purple-500">⏳</span>}
                    </div>
                  )}
                  <div><span className="font-semibold">Pick:</span> {o.picking_time || '—'}</div>
                  <div><span className="font-semibold">Idle:</span> <span className="text-orange-600">{o.idle_time || '—'}</span></div>
                  <div><span className="font-semibold">Check:</span> {o.checking_time || '—'}</div>
                  <div><span className="font-semibold">Total:</span> <span className="font-bold">{o.total_time || '—'}</span></div>
                </div>
              )}

              {['PICKED','DONE'].includes(o.status) && !o.approved && (
                <button onClick={() => approveOrder(o)}
                  className="mt-2 w-full bg-orange-100 hover:bg-orange-200 active:scale-95 text-orange-700 font-bold py-2.5 rounded-xl text-sm transition-all">
                  ⏳ Tap to Approve
                </button>
              )}
              {o.approved && (
                <div className="mt-2 w-full bg-green-100 text-green-700 font-bold py-2 rounded-xl text-xs text-center">
                  ✅ {o.approved_by_name ? `Approved · ${o.approved_by_name}` : 'Approved'}
                </div>
              )}
            </div>
            );
          })}
        </div>
        )}

        {/* Bulk assign bar */}
        {selected.size > 0 && (
          <div className="fixed inset-x-0 bottom-16 z-40 px-3 pb-2 print:hidden">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-blue-200 p-3 flex items-center gap-2">
              <button onClick={() => setSelected(new Set())} aria-label="Clear selection"
                className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-blue-700 font-bold">✕</button>
              <div className="shrink-0 text-blue-900 font-bold text-sm leading-tight">
                {selected.size}<span className="block text-[10px] font-semibold text-blue-400">selected</span>
              </div>
              <select value={bulkPicker} onChange={e => setBulkPicker(e.target.value)}
                className="flex-1 min-w-0 border-2 border-blue-200 rounded-xl px-2 py-2.5 text-sm font-semibold text-blue-900 focus:outline-none focus:border-blue-500">
                <option value="">Choose picker…</option>
                {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={assignSelected} disabled={!bulkPicker}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 active:scale-95 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all">
                Assign
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function TrashIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}
