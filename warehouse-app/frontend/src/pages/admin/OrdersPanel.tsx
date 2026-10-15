import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/index';
import UploadOrdersModal from './UploadOrdersModal';
import { useLive } from '../../lib/useLive';
import { deptLabel as labelFor } from '../../lib/dept';
import { useToast } from '../../components/Toast';
import { downloadSignoffReport } from '../../lib/exportReport';

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
  cancelled_at?: string | null;
  cancelled_by?: string | null;
}

interface Picker { id: string; name: string; }

const STATUS_COLORS: Record<string, string> = {
  UNASSIGNED: 'bg-blue-100 text-blue-700',
  ASSIGNED:   'bg-blue-200 text-blue-800',
  PICKING:    'bg-yellow-100 text-yellow-700',
  PICKED:     'bg-blue-300 text-blue-900',
  CHECKING:   'bg-indigo-100 text-indigo-700',
  DONE:       'bg-green-100 text-green-700',
  CANCELLED:  'bg-red-100 text-red-700',
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
  { key: 'cancelled',  label: 'Cancelled',       color: 'text-red-300',    test: (o: Order) => o.status === 'CANCELLED' },
] as const;
type FilterKey = typeof FILTERS[number]['key'];

// Delivery types — high priority first. Pronto + Transport = "Priority".
const DELIVERY_ORDER = ['Pronto', 'Transport', 'Guard-Room', 'Giving'];
const PRIORITY = ['Pronto', 'Transport'];
const DELIVERY_STYLE: Record<string, string> = {
  'Pronto':     'bg-red-100 text-red-700 border-red-200',
  'Transport':  'bg-purple-100 text-purple-700 border-purple-200',
  'Guard-Room': 'bg-amber-100 text-amber-800 border-amber-200',
  'Giving':     'bg-slate-100 text-slate-600 border-slate-200',
};
const deliveryStyle = (t: string) => DELIVERY_STYLE[t] || 'bg-blue-50 text-blue-600 border-blue-200';
const DELIVERY_KEY = 'deliveryFilter';
const loadDeliveryFilter = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DELIVERY_KEY) || '[]'); } catch { return []; }
};

export default function OrdersPage() {
  const { department } = useParams<{ department: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const dept = department || 'machinery';
  const deptLabel = labelFor(dept);

  const today = new Date().toISOString().split('T')[0];

  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<FilterKey>('all');
  // Delivery types to show (empty = all). Remembered on this device.
  const [delivery, setDeliveryState]  = useState<string[]>(loadDeliveryFilter);
  const setDelivery = (v: string[]) => {
    setDeliveryState(v);
    try { localStorage.setItem(DELIVERY_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  };
  const [loading, setLoading]         = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUpload, setShowUpload]   = useState(false);
  const [date, setDate]               = useState(today);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  // In-app confirmation (browser confirm() pop-ups can be blocked on phones)
  const [confirmBox, setConfirmBox]   = useState<null | {
    title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void;
  }>(null);
  const [deleting, setDeleting]       = useState(false);
  const [bulkPicker, setBulkPicker]   = useState('');

  // Orders added by the latest upload — kept on top with a NEW badge until assigned.
  // Remembered per department + day, so it survives a page refresh.
  const newKey = `newOrders:${dept}:${date}`;
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setNewIds(new Set(JSON.parse(localStorage.getItem(newKey) || '[]'))); }
    catch { setNewIds(new Set()); }
  }, [newKey]);
  const markNew = (ids: string[]) => {
    setNewIds(new Set(ids));
    try { localStorage.setItem(newKey, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  };

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
    const ids = orders.filter(o => selected.has(o.id) && ASSIGNABLE.includes(o.status)).map(o => o.id);
    if (!bulkPicker) return;
    if (!ids.length) { toast('❌ None of the selected orders can be assigned (already started)'); return; }
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

  // ── Delete (one or many) ──
  const removeOrders = async (ids: string[], includeStarted: boolean) => {
    const snapshot = orders;
    setDeleting(true);
    ordersLive.mutate(list => list.filter(o => !ids.includes(o.id)));
    setSelected(new Set());
    try {
      const res = await api.post('/orders/bulk-delete', { order_ids: ids, include_started: includeStarted });
      const { deleted, skipped } = res.data;
      toast(`🗑 ${deleted} order${deleted === 1 ? '' : 's'} deleted` + (skipped ? ` · ${skipped} skipped` : ''));
    } catch (err: any) {
      ordersLive.mutate(() => snapshot);
      toast(`❌ Delete failed: ${err.response?.data?.error || err.message || 'please try again'}`, { ms: 7000 });
    } finally {
      setDeleting(false);
      setConfirmBox(null);
      ordersLive.refresh();
    }
  };

  const deleteOrder = (order: Order) => {
    setConfirmBox({
      title: `Delete ${order.so_number}?`,
      body: 'This order will be removed from the list.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => removeOrders([order.id], !ASSIGNABLE.includes(order.status)),
    });
  };

  const deleteSelected = () => {
    const chosen = orders.filter(o => selected.has(o.id));
    if (!chosen.length) return;
    const started = chosen.filter(o => !ASSIGNABLE.includes(o.status)).length;
    const everything = chosen.length === orders.length;
    setConfirmBox({
      title: everything ? `Delete ALL ${chosen.length} orders?` : `Delete ${chosen.length} order${chosen.length === 1 ? '' : 's'}?`,
      body: (
        <>
          {everything && <p>Every order for {date === today ? 'today' : date} in this department will be removed.</p>}
          {started > 0 && (
            <p className="mt-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
              ⚠ {started} of these {started === 1 ? 'has' : 'have'} already started picking/checking — their timing records will be lost.
            </p>
          )}
          <p className="mt-2">This can't be undone.</p>
        </>
      ),
      confirmLabel: `Delete ${chosen.length}`,
      danger: true,
      onConfirm: () => removeOrders(chosen.map(o => o.id), true),
    });
  };

  // ── Cancel / restore ──
  const setCancelled = async (ids: string[], cancel: boolean) => {
    const snapshot = orders;
    patchOrders(ids, cancel ? { status: 'CANCELLED', cancelled_by: 'you' } : {});
    setSelected(new Set());
    setConfirmBox(null);
    try {
      const res = await api.patch(cancel ? '/orders/cancel' : '/orders/restore', { order_ids: ids });
      const n = cancel ? res.data.cancelled : res.data.restored;
      toast(cancel ? `⛔ ${n} order${n === 1 ? '' : 's'} marked cancelled` : `↩ ${n} order${n === 1 ? '' : 's'} restored`);
    } catch (err: any) {
      ordersLive.mutate(() => snapshot);
      toast(`❌ ${err.response?.data?.error || 'Failed — please try again'}`);
    } finally {
      ordersLive.refresh();
    }
  };

  const cancelSelected = () => {
    const chosen = orders.filter(o => selected.has(o.id) && o.status !== 'CANCELLED');
    if (!chosen.length) return;
    const started = chosen.filter(o => !ASSIGNABLE.includes(o.status)).length;
    setConfirmBox({
      title: `Mark ${chosen.length} order${chosen.length === 1 ? '' : 's'} as cancelled?`,
      body: (
        <>
          <p>{chosen.length === 1 ? chosen[0].so_number : 'They'} will stay in the list as <b>Cancelled</b> and disappear from pickers' and checkers' screens.</p>
          {started > 0 && <p className="mt-2 text-orange-700">{started} of these {started === 1 ? 'has' : 'have'} already started.</p>}
          <p className="mt-2 text-blue-500">You can restore them later if needed.</p>
        </>
      ),
      confirmLabel: '⛔ Mark cancelled',
      danger: true,
      onConfirm: () => setCancelled(chosen.map(o => o.id), true),
    });
  };

  const restoreOrders = (ids: string[]) => setCancelled(ids, false);

  const approveOrder = (order: Order) => {
    if (order.approved) return;
    setConfirmBox({
      title: `Approve ${order.so_number}?`,
      body: 'Mark this order as approved.',
      confirmLabel: '✅ Approve',
      onConfirm: async () => {
        setConfirmBox(null);
        patchOrders([order.id], { approved: true });
        try {
          await api.patch(`/orders/${order.id}/approve`, {});
          ordersLive.refresh();
        } catch (err: any) {
          patchOrders([order.id], { approved: false });
          toast(`❌ ${err.response?.data?.error || 'Failed to approve'}`);
        }
      },
    });
  };

  const [exporting, setExporting] = useState(false);
  const exportOrders = async () => {
    if (exporting) return;
    setExporting(true);
    toast('⏳ Preparing report…', { type: 'info', ms: 1500 });
    try {
      await downloadSignoffReport(dept, date);
    } catch (err: any) {
      toast(`❌ ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const byDelivery = useMemo(
    () => (delivery.length ? orders.filter(o => delivery.includes(o.delivery_type)) : orders),
    [orders, delivery]);

  // Chip counts follow the status card that is selected (e.g. Unassigned)
  const deliveryCounts = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!;
    const counts = new Map<string, number>();
    orders.filter(f.test).forEach(o => counts.set(o.delivery_type, (counts.get(o.delivery_type) || 0) + 1));
    const types = [...new Set([...DELIVERY_ORDER.filter(t => counts.has(t)), ...counts.keys()])].filter(Boolean);
    return { types, counts };
  }, [orders, filter]);
  const isPriority = delivery.length === PRIORITY.length && PRIORITY.every(t => delivery.includes(t));
  const toggleDelivery = (t: string) =>
    setDelivery(delivery.includes(t) ? delivery.filter(x => x !== t) : [...delivery, t]);

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!;
    const q = search.trim().toLowerCase();
    const list = byDelivery.filter(o => f.test(o) && (!q || o.so_number.toLowerCase().includes(q)));
    // Unassigned orders from the latest upload always go first
    const isFresh = (o: Order) => newIds.has(String(o.id)) && o.status === 'UNASSIGNED';
    const cancelled = (o: Order) => o.status === 'CANCELLED';
    return [...list.filter(isFresh), ...list.filter(o => !isFresh(o) && !cancelled(o)), ...list.filter(cancelled)];
  }, [byDelivery, filter, search, newIds]);
  const isNew = (o: Order) => newIds.has(String(o.id)) && o.status === 'UNASSIGNED';
  const freshCount = orders.filter(isNew).length;

  const selectableVisible = filtered;
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(o => selected.has(o.id));

  const selectedOrders = orders.filter(o => selected.has(o.id));
  const allSelectedCancelled = selectedOrders.length > 0 && selectedOrders.every(o => o.status === 'CANCELLED');

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
            const isCancelled = f.key === 'cancelled';
            return (
              <button key={f.key} onClick={() => setFilter(active && f.key !== 'all' ? 'all' : f.key)}
                className={`rounded-2xl p-3 md:p-4 text-center transition-all active:scale-95
                  ${isCancelled ? 'bg-red-950/70' : 'bg-blue-900'}
                  ${active ? 'ring-2 ring-blue-300' : 'hover:brightness-110'}`}>
                <div className={`text-xl md:text-3xl font-bold ${f.color}`}>{byDelivery.filter(f.test).length}</div>
                <div className={`text-[11px] md:text-xs mt-1 font-medium ${isCancelled ? 'text-red-300' : 'text-blue-300'}`}>{f.label}</div>
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
            onImported={(msg, createdIds) => {
              setShowUpload(false);
              // Only flag NEW when this upload adds to orders already there (e.g. the 12 pm
              // report on top of the 8 am one) — the first upload of the day is all new anyway.
              const hadOrdersToday = date === today && orders.length > 0;
              if (createdIds.length && (hadOrdersToday || /already existed/.test(msg))) {
                const key = `newOrders:${dept}:${today}`;
                try { localStorage.setItem(key, JSON.stringify(createdIds)); } catch { /* ignore */ }
                if (date === today) markNew(createdIds);
                setFilter('all'); setSearch('');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
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

        {freshCount > 0 && (
          <div className="bg-green-600/90 text-white rounded-2xl px-4 py-3 mb-3 flex items-center gap-3">
            <span className="flex-1 text-sm font-semibold">🆕 {freshCount} new order{freshCount === 1 ? '' : 's'} from the latest upload — shown on top</span>
            <button onClick={() => setSelected(new Set(orders.filter(isNew).map(o => o.id)))}
              className="shrink-0 bg-white text-green-700 font-bold px-3 py-2 rounded-xl text-xs active:scale-95">
              Select new
            </button>
            <button onClick={() => markNew([])} aria-label="Dismiss" className="shrink-0 text-white/80 px-1 text-lg">✕</button>
          </div>
        )}

        {/* Delivery type filter */}
        {deliveryCounts.types.length > 0 && (
          <div className="-mx-4 md:mx-0 mb-3 overflow-x-auto no-scrollbar">
            <div className="flex gap-2 px-4 md:px-0 w-max md:w-auto md:flex-wrap items-center">
              <span className="text-blue-400 text-xs font-semibold mr-1 shrink-0">Delivery:</span>
              <Chip active={!delivery.length} onClick={() => setDelivery([])}>All</Chip>
              <Chip active={isPriority} onClick={() => setDelivery(isPriority ? [] : PRIORITY)} className="!border-orange-400">
                ⚡ Priority
                <Count n={PRIORITY.reduce((n, t) => n + (deliveryCounts.counts.get(t) || 0), 0)} active={isPriority} />
              </Chip>
              {deliveryCounts.types.map(t => (
                <Chip key={t} active={delivery.includes(t)} onClick={() => toggleDelivery(t)}>
                  {t}<Count n={deliveryCounts.counts.get(t) || 0} active={delivery.includes(t)} />
                </Chip>
              ))}
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
              {allVisibleSelected ? `☐ Clear selection (${selectableVisible.length})` : `☑ Select all (${selectableVisible.length})`}
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
                      disabled={!selectableVisible.length} className="w-4 h-4 accent-blue-300" title="Select all" />
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
                  const isCancelled = o.status === 'CANCELLED';
                  return (
                  <tr key={o.id} className={`${isSel ? 'bg-blue-100' : i % 2 === 0 ? 'bg-white' : 'bg-blue-50'} ${isCancelled ? 'opacity-60' : ''}`}>
                    <td className="pl-4 py-3">
                      <input type="checkbox" checked={isSel} onChange={() => toggle(o.id)} className="w-4 h-4 accent-blue-600" />
                    </td>
                    <td className={`px-4 py-3 font-bold whitespace-nowrap ${isCancelled ? 'text-red-800 line-through' : 'text-blue-900'}`}>
                      {o.so_number}
                      {isNew(o) && <span className="ml-2 bg-green-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">NEW</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{o.size || '—'}</td>
                    <td className="px-4 py-3">
                      {o.delivery_type
                        ? <span className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${deliveryStyle(o.delivery_type)}`}>{o.delivery_type}</span>
                        : '—'}
                    </td>
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
                        {isCancelled && (
                          <button onClick={() => restoreOrders([o.id])} title={o.cancelled_by ? `Cancelled by ${o.cancelled_by}` : 'Cancelled'}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-lg text-xs whitespace-nowrap">
                            ↩ Restore
                          </button>
                        )}
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
            const isCancelled = o.status === 'CANCELLED';
            return (
            <div key={o.id} className={`rounded-2xl p-3 transition-all ${isCancelled ? 'bg-red-50/90' : 'bg-white'} ${isSel ? 'ring-4 ring-blue-400' : ''}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle(o.id)} aria-label="Select order"
                  className={`w-8 h-8 shrink-0 rounded-lg border-2 flex items-center justify-center text-sm font-bold
                    ${isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-blue-200 text-transparent'}`}>
                  ✓
                </button>
                <div className="flex-1 min-w-0" onClick={() => toggle(o.id)}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-bold text-base whitespace-nowrap ${isCancelled ? 'text-red-800 line-through' : 'text-blue-900'}`}>{o.so_number}</span>
                    {isNew(o) && <span className="bg-green-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">NEW</span>}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                  </div>
                  <div className="text-xs text-blue-500 mt-0.5">
                    <span className="font-semibold">{o.size || '—'}</span>
                    {o.delivery_type && (
                      <span className={`ml-1.5 px-1.5 py-px rounded border text-[11px] font-semibold ${deliveryStyle(o.delivery_type)}`}>{o.delivery_type}</span>
                    )}
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

              {isCancelled && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 text-xs text-red-700">
                    ⛔ Cancelled{o.cancelled_by ? ` by ${o.cancelled_by}` : ''}
                    {o.cancelled_at && ` · ${new Date(o.cancelled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </span>
                  <button onClick={() => restoreOrders([o.id])}
                    className="shrink-0 bg-white border border-blue-200 text-blue-700 font-bold px-3 py-2 rounded-xl text-xs active:scale-95">
                    ↩ Restore
                  </button>
                </div>
              )}

              {!assignable && !isCancelled && (
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

        {/* Bulk action bar: assign, cancel or delete the selected orders */}
        {selected.size > 0 && (
          <div className="fixed inset-x-0 bottom-16 z-40 px-3 pb-2 print:hidden">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-blue-200 p-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setSelected(new Set())} aria-label="Clear selection"
                className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-blue-700 font-bold">✕</button>
              <div className="shrink-0 text-blue-900 font-bold text-sm leading-tight mr-auto sm:mr-0">
                {selected.size}<span className="block text-[10px] font-semibold text-blue-400">selected</span>
              </div>
              {allSelectedCancelled ? (
                <button onClick={() => restoreOrders([...selected])}
                  className="shrink-0 bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 font-bold px-3 py-2.5 rounded-xl text-sm transition-all">
                  ↩ Restore
                </button>
              ) : (
                <button onClick={cancelSelected}
                  className="shrink-0 bg-orange-100 hover:bg-orange-200 active:scale-95 text-orange-800 font-bold px-3 py-2.5 rounded-xl text-sm transition-all">
                  ⛔ Cancel order{selected.size === 1 ? '' : 's'}
                </button>
              )}
              <button onClick={deleteSelected} disabled={deleting} aria-label="Delete selected" title="Delete selected"
                className="shrink-0 bg-red-600 hover:bg-red-700 disabled:bg-red-300 active:scale-95 text-white p-2.5 rounded-xl transition-all sm:order-last">
                <TrashIcon size={18} />
              </button>
              {!allSelectedCancelled && (
                <div className="basis-full sm:basis-auto sm:flex-1 flex gap-2 min-w-0">
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
              )}
            </div>
          </div>
        )}

      </div>

      {confirmBox && (
        <div className="fixed inset-0 z-[70] bg-blue-950/80 flex items-end sm:items-center justify-center p-3 print:hidden"
          onClick={() => !deleting && setConfirmBox(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className={`text-lg font-bold ${confirmBox.danger ? 'text-red-700' : 'text-blue-900'}`}>{confirmBox.title}</h3>
            <div className="text-sm text-blue-700 mt-2">{confirmBox.body}</div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmBox(null)} disabled={deleting}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3.5 rounded-xl text-sm">
                Cancel
              </button>
              <button onClick={confirmBox.onConfirm} disabled={deleting}
                className={`flex-1 font-bold py-3.5 rounded-xl text-sm text-white active:scale-95 transition-all
                  ${confirmBox.danger ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {deleting ? 'Deleting…' : confirmBox.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, className = '', children }: {
  active: boolean; onClick: () => void; className?: string; children: ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-semibold transition-all active:scale-95
        ${active ? 'bg-white text-blue-900 border-white shadow' : 'bg-blue-900 text-blue-200 border-blue-700 hover:bg-blue-800'} ${className}`}>
      {children}
    </button>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold
      ${active ? 'bg-blue-600 text-white' : 'bg-blue-700 text-blue-100'}`}>{n}</span>
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
