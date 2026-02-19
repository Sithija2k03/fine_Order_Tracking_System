import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/index';

// Interface matches exact column names returned by backend SQL aliases
interface ApprovedOrder {
  'SO Number': string;
  'Status': string;
  'Order Size': string;
  'Delivery Type': string;
  'Department': string;
  'Picker Name': string;
  'Pick Start': string;
  'Pick End': string;
  'Picking Duration': string;
  'Idle Start': string;
  'Idle End': string;
  'Idle Time': string;
  'Checker Name': string;
  'Check Start': string;
  'Check End': string;
  'Checking Duration': string;
  'Total Duration': string;
  'Approved At': string;
  'Date': string;
}

export default function ApprovedOrdersPage() {
  const { department } = useParams<{ department: string }>();
  const navigate = useNavigate();
  const dept = department || 'machinery';
  const deptLabel = dept === 'machinery' ? '🔧 Machinery' : '🔩 Accessories';

  const [orders, setOrders] = useState<ApprovedOrder[]>([]);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchApproved(); }, [dept, date]);

  const fetchApproved = async () => {
    try {
      const res = await api.get(`/orders/approved?department=${dept}&date=${date}`);
      setOrders(res.data);
    } catch (err) { console.error(err); }
  };

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const exportApproved = () => {
    if (!orders.length) { showMsg('❌ No approved orders to export'); return; }

    const headers = Object.keys(orders[0]);
    const csv = [
      headers.join(','),
      ...orders.map(o =>
        headers.map(h => `"${o[h as keyof ApprovedOrder] ?? ''}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Approved_Orders_${dept}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showMsg('✅ Export downloaded');
  };

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {deptLabel} — Approved Orders
              </h1>
              <p className="text-blue-300 text-sm mt-1">{orders.length} approved orders</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="px-3 py-2 bg-blue-800 text-white border border-blue-600 rounded-xl text-sm focus:outline-none"
              />
              <button
                onClick={exportApproved}
                className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all"
              >
                📥 Export CSV
              </button>
              <button
                onClick={() => navigate(`/admin/${dept}/orders`)}
                className="bg-blue-800 hover:bg-blue-700 active:scale-95 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="bg-blue-100 text-blue-900 px-4 py-3 rounded-xl mb-4 font-medium text-center">
            {message}
          </div>
        )}

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-4 py-3 text-left font-semibold">SO #</th>
                  <th className="px-4 py-3 text-left font-semibold">Size</th>
                  <th className="px-4 py-3 text-left font-semibold">Delivery</th>
                  <th className="px-4 py-3 text-left font-semibold">Picker</th>
                  <th className="px-4 py-3 text-left font-semibold">Pick Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Idle Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Checker</th>
                  <th className="px-4 py-3 text-left font-semibold">Check Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Total</th>
                  <th className="px-4 py-3 text-left font-semibold">Approved At</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-blue-300">
                      No approved orders for this date
                    </td>
                  </tr>
                ) : (
                  orders.map((o, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                      <td className="px-4 py-3 font-bold text-blue-900">{o['SO Number']}</td>
                      <td className="px-4 py-3 text-blue-700">{o['Order Size'] || '—'}</td>
                      <td className="px-4 py-3 text-blue-700">{o['Delivery Type'] || '—'}</td>
                      <td className="px-4 py-3 font-medium text-blue-800">{o['Picker Name'] || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-600">{o['Picking Duration'] || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-orange-600">{o['Idle Time'] || '—'}</td>
                      <td className="px-4 py-3 font-medium text-blue-800">{o['Checker Name'] || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-600">{o['Checking Duration'] || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-900">{o['Total Duration'] || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-green-600">{o['Approved At'] || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {orders.length === 0 ? (
            <div className="text-center text-blue-300 py-8">
              No approved orders for this date
            </div>
          ) : (
            orders.map((o, i) => (
              <div key={i} className="bg-white rounded-2xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-blue-900 text-lg">{o['SO Number']}</span>
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg text-xs font-bold">
                    ✅ APPROVED
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                  <div><span className="font-semibold">Size:</span> {o['Order Size'] || '—'}</div>
                  <div><span className="font-semibold">Delivery:</span> {o['Delivery Type'] || '—'}</div>
                  <div><span className="font-semibold">Picker:</span> {o['Picker Name'] || '—'}</div>
                  <div><span className="font-semibold">Checker:</span> {o['Checker Name'] || '—'}</div>
                  <div><span className="font-semibold">Pick Time:</span> {o['Picking Duration'] || '—'}</div>
                  <div>
                    <span className="font-semibold">Idle:</span>{' '}
                    <span className="text-orange-600">{o['Idle Time'] || '—'}</span>
                  </div>
                  <div><span className="font-semibold">Check Time:</span> {o['Checking Duration'] || '—'}</div>
                  <div>
                    <span className="font-semibold">Total:</span>{' '}
                    <span className="font-bold">{o['Total Duration'] || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold">Approved At:</span>{' '}
                    <span className="text-green-600">{o['Approved At'] || '—'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}