import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/index';

interface Order {
  id: string;
  so_number: string;
  status: string;
  size: string;
  delivery_type: string;
  picker_name: string;
  checker_name: string;
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

export default function OrdersPage() {
  const { department } = useParams<{ department: string }>();
  const navigate = useNavigate();
  const dept = department || 'machinery';
  const deptLabel = dept === 'machinery' ? '🔧 Machinery' : '🔩 Accessories';

  const [orders, setOrders] = useState<Order[]>([]);
  const [pickers, setPickers] = useState<Picker[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [soNumber, setSoNumber] = useState('');
  const [size, setSize] = useState('');
  const [deliveryType, setDeliveryType] = useState('');
  const [pickerId, setPickerId] = useState('');

  useEffect(() => { fetchData(); }, [department]);

  const fetchData = async () => {
    try {
      const [o, p] = await Promise.all([
        api.get(`/orders?department=${dept}`),
        api.get(`/pickers?department=${dept}`)
      ]);
      setOrders(o.data);
      setPickers(p.data);
    } catch (err) { console.error(err); }
  };

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const addOrder = async () => {
    if (!soNumber.trim() || !size || !deliveryType) {
      showMsg('❌ Please fill SO Number, Size and Delivery Type');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/orders', {
        so_number: soNumber.trim().toUpperCase(),
        size,
        delivery_type: deliveryType,
        department: dept
      });
      if (pickerId) {
        await api.patch(`/orders/${res.data.id}/assign`, { picker_id: pickerId });
      }
      setSoNumber(''); setSize(''); setDeliveryType(''); setPickerId('');
      setShowAddForm(false);
      showMsg('✅ Order added successfully');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to add order'}`);
    } finally { setLoading(false); }
  };

  const assignPicker = async (orderId: string, pid: string) => {
    try {
      await api.patch(`/orders/${orderId}/assign`, { picker_id: pid });
      showMsg('✅ Picker assigned');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to assign'}`);
    }
  };

  const deleteOrder = async (orderId: string, status: string) => {
    if (!['UNASSIGNED', 'ASSIGNED'].includes(status)) {
      showMsg('❌ Cannot delete an order that has started picking');
      return;
    }
    if (!confirm('Delete this order?')) return;
    try {
      await api.delete(`/orders/${orderId}`);
      showMsg('✅ Order deleted');
      fetchData();
    } catch { showMsg('❌ Failed to delete order'); }
  };

  const approveOrder = async (orderId: string, approved: boolean) => {
    if (approved) { showMsg('⚠️ Order already approved'); return; }
    if (!confirm('Approve this order?')) return;
    try {
      await api.patch(`/orders/${orderId}/approve`, {});
      showMsg('✅ Order approved!');
      fetchData();
    } catch (err: any) {
      showMsg(`❌ ${err.response?.data?.error || 'Failed to approve'}`);
    }
  };

  const exportOrders = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/orders/export?date=${today}&department=${dept}`);
      const rows = res.data;
      if (!rows.length) { showMsg('❌ No orders to export for today'); return; }
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map((r: any) =>
          headers.map(h => `"${r[h] ?? ''}"`).join(',')
        )
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Orders_${dept}_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg('✅ Export downloaded');
    } catch { showMsg('❌ Export failed'); }
  };

  const filtered = orders.filter(o =>
    o.so_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {deptLabel} — Orders
              </h1>
              <p className="text-blue-300 text-sm mt-1">{orders.length} total orders</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
              >
                + Add Order
              </button>
              <button
                onClick={exportOrders}
                className="bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
              >
                📥 Export Today
              </button>
              <button
                onClick={() => navigate(`/admin/${dept}/approved`)}
                className="bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
              >
                ✅ Approved Orders
              </button>
              <button
                onClick={() => navigate(`/admin/${dept}`)}
                className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-white font-semibold px-4 py-3 rounded-xl text-sm md:text-base transition-all"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>

        {/* ── SUMMARY STATS BAR ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-blue-900 rounded-2xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">{orders.length}</div>
            <div className="text-blue-300 text-xs mt-1 font-medium">Total Orders</div>
          </div>
          <div className="bg-blue-900 rounded-2xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-blue-300">{orders.filter(o => o.status === 'UNASSIGNED').length}</div>
            <div className="text-blue-400 text-xs mt-1 font-medium">Unassigned</div>
          </div>
          <div className="bg-blue-900 rounded-2xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-yellow-300">{orders.filter(o => ['ASSIGNED', 'PICKING'].includes(o.status)).length}</div>
            <div className="text-blue-400 text-xs mt-1 font-medium">In Progress</div>
          </div>
          <div className="bg-blue-900 rounded-2xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-cyan-300">{orders.filter(o => ['PICKED', 'CHECKING'].includes(o.status)).length}</div>
            <div className="text-blue-400 text-xs mt-1 font-medium">Picked</div>
          </div>
          <div className="bg-blue-900 rounded-2xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-green-300">{orders.filter(o => o.status === 'DONE').length}</div>
            <div className="text-blue-400 text-xs mt-1 font-medium">Done</div>
          </div>
          <div className="bg-orange-900 rounded-2xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-orange-300">{orders.filter(o => ['PICKED', 'DONE'].includes(o.status) && !o.approved).length}</div>
            <div className="text-orange-400 text-xs mt-1 font-medium">Pending Approval</div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="bg-blue-100 text-blue-900 px-4 py-3 rounded-xl mb-4 font-medium text-center">
            {message}
          </div>
        )}

        {/* Add Order Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl p-4 md:p-6 mb-6">
            <h2 className="text-lg font-bold text-blue-900 mb-4">➕ Add New Order</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">SO Number *</label>
                <input
                  type="text" value={soNumber} onChange={e => setSoNumber(e.target.value)}
                  placeholder="e.g. SO-1001"
                  className="w-full px-3 py-3 border-2 border-blue-100 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                />
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

        {/* Search */}
        <div className="mb-4">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by SO number..."
            className="w-full md:w-72 px-4 py-3 bg-blue-900 text-white placeholder-blue-400 border-2 border-blue-700 rounded-xl text-sm focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* ── DESKTOP TABLE ── */}
        <div className="hidden md:block bg-white rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-4 py-3 text-left font-semibold">SO #</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Size</th>
                  <th className="px-4 py-3 text-left font-semibold">Delivery</th>
                  <th className="px-4 py-3 text-left font-semibold">Picker</th>
                  <th className="px-4 py-3 text-left font-semibold">Pick Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Idle Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Checker</th>
                  <th className="px-4 py-3 text-left font-semibold">Check Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Total</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-blue-300">No orders found</td>
                  </tr>
                ) : filtered.map((o, i) => (
                  <tr key={o.id} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                    <td className="px-4 py-3 font-bold text-blue-900">{o.so_number}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[o.status] || ''}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{o.size || '—'}</td>
                    <td className="px-4 py-3 text-blue-700">{o.delivery_type || '—'}</td>
                    <td className="px-4 py-3">
                      {['UNASSIGNED', 'ASSIGNED'].includes(o.status) ? (
                        <select
                          value={o.picker_name ? pickers.find(p => p.name === o.picker_name)?.id || '' : ''}
                          onChange={e => assignPicker(o.id, e.target.value)}
                          className="border border-blue-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Assign</option>
                          {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-blue-800 font-medium">{o.picker_name || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-blue-600 font-mono text-xs">{o.picking_time || '—'}</td>
                    <td className="px-4 py-3 text-orange-600 font-mono text-xs">{o.idle_time || '—'}</td>
                    <td className="px-4 py-3 text-blue-800 font-medium">{o.checker_name || '—'}</td>
                    <td className="px-4 py-3 text-blue-600 font-mono text-xs">{o.checking_time || '—'}</td>
                    <td className="px-4 py-3 text-blue-900 font-mono text-xs font-bold">{o.total_time || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {['UNASSIGNED', 'ASSIGNED'].includes(o.status) && (
                          <button
                            onClick={() => deleteOrder(o.id, o.status)}
                            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white p-2 rounded-lg transition-all"
                            title="Delete order"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        )}
                        {['PICKED', 'DONE'].includes(o.status) && !o.approved && (
                          <button
                            onClick={() => approveOrder(o.id, o.approved)}
                            className="bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold px-2 py-1 rounded-lg text-xs transition-all whitespace-nowrap"
                          >
                            ⏳ Pending Approval
                          </button>
                        )}
                        {o.approved && (
                          <span className="bg-green-100 text-green-700 font-bold px-2 py-1 rounded-lg text-xs whitespace-nowrap">
                            ✅ Approved
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── MOBILE CARDS ── */}
        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center text-blue-300 py-8">No orders found</div>
          ) : filtered.map(o => (
            <div key={o.id} className="bg-white rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-blue-900 text-lg">{o.so_number}</span>
                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[o.status] || ''}`}>
                  {o.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                <div><span className="font-semibold">Size:</span> {o.size || '—'}</div>
                <div><span className="font-semibold">Delivery:</span> {o.delivery_type || '—'}</div>
                <div><span className="font-semibold">Picker:</span> {o.picker_name || '—'}</div>
                <div><span className="font-semibold">Checker:</span> {o.checker_name || '—'}</div>
                <div><span className="font-semibold">Pick Time:</span> {o.picking_time || '—'}</div>
                <div><span className="font-semibold">Idle:</span> <span className="text-orange-600">{o.idle_time || '—'}</span></div>
                <div><span className="font-semibold">Check Time:</span> {o.checking_time || '—'}</div>
                <div><span className="font-semibold">Total:</span> <span className="font-bold">{o.total_time || '—'}</span></div>
              </div>
              {['UNASSIGNED', 'ASSIGNED'].includes(o.status) && (
                <div className="mt-3 flex gap-2">
                  <select
                    onChange={e => assignPicker(o.id, e.target.value)}
                    className="flex-1 border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Assign Picker</option>
                    {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {/* ── ONLY THIS BUTTON CHANGED ── */}
                  <button
                    onClick={() => deleteOrder(o.id, o.status)}
                    className="bg-red-600 hover:bg-red-700 active:scale-95 text-white p-2.5 rounded-xl transition-all"
                    title="Delete order"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                </div>
              )}
              {['PICKED', 'DONE'].includes(o.status) && !o.approved && (
                <button
                  onClick={() => approveOrder(o.id, o.approved)}
                  className="mt-3 w-full bg-orange-100 hover:bg-orange-200 active:scale-95 text-orange-700 font-bold py-3 rounded-xl text-sm transition-all"
                >
                  ⏳ Pending Approval — Tap to Approve
                </button>
              )}
              {o.approved && (
                <div className="mt-3 w-full bg-green-100 text-green-700 font-bold py-3 rounded-xl text-sm text-center">
                  ✅ Approved
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}