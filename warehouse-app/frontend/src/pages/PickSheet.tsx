import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/index';
import { useLive } from '../lib/useLive';
import { useToast } from '../components/Toast';

// ─────────────────────────────────────────────────────────────────────
// Digital sales order — opens when the picker taps Start Picking.
// Laid out like the printed BusyWin sales order (customer details left,
// order details right, S.N. / Code / Description / Qty / Unit / Location
// table, Taken By / Checked By / Authorized By / No of Carton footer),
// with a tick box on every line so the picker marks items as collected.
// Opened from /sheet/:orderId it is read-only (checkers, admin).
// ─────────────────────────────────────────────────────────────────────

interface Line {
  id: number;
  line_no: number;
  item_code: string | null;
  description: string;
  qty: number;
  unit: string | null;
  location: string | null;
  picked_qty: number | null;
  picked_at: string | null;
}
interface SheetOrder {
  id: string;
  so_number: string;
  status: string;
  size: string;
  delivery_type: string;
  customer_name: string | null;
  customer_address: string | null;
  customer_phone: string | null;
  order_type: string | null;
  sales_rep: string | null;
  report_date: string | null;
  cartons: number | null;
  created_at: string;
  picker_start: string | null;
  picker_end: string | null;
  picker_id: string | null;
  picker_name: string | null;
}
interface Sheet { order: SheetOrder; lines: Line[]; }

const DELIVERY_STYLE: Record<string, string> = {
  Pronto: 'bg-red-100 text-red-700', Transport: 'bg-purple-100 text-purple-700',
  'Guard-Room': 'bg-amber-100 text-amber-800', Giving: 'bg-slate-100 text-slate-700',
};
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
const fmtDate = (d: string) => new Date(d.length === 10 ? d + 'T00:00:00' : d)
  .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
const fmtTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const stateOf = (l: Line): 'todo' | 'done' | 'short' =>
  l.picked_qty === null ? 'todo' : l.picked_qty >= l.qty ? 'done' : 'short';

export default function PickSheet() {
  const { id: pickerId, orderId } = useParams<{ id: string; orderId: string }>();
  const [params] = useSearchParams();
  const dept = params.get('dept') || 'machinery';
  const navigate = useNavigate();
  const toast = useToast();

  const live = useLive<Sheet>(`/orders/${orderId}/sheet`);
  const order = live.data?.order;
  const lines = live.data?.lines ?? [];

  const [view, setView] = useState<'all' | 'todo'>('all');
  const [sortByLoc, setSortByLoc] = useState(false);
  const [shortLine, setShortLine] = useState<Line | null>(null);
  const [shortQty, setShortQty] = useState('');
  const [cartons, setCartons] = useState('');
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = () => (pickerId ? navigate(`/picker/${pickerId}?dept=${dept}`, { replace: true }) : navigate(-1));
  const canEdit = !!pickerId && order?.status === 'PICKING' && order?.picker_id === pickerId;

  const done  = lines.filter(l => stateOf(l) === 'done').length;
  const short = lines.filter(l => stateOf(l) === 'short').length;
  const todo  = lines.length - done - short;
  const pct   = lines.length ? Math.round(((done + short) / lines.length) * 100) : 0;
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  const hasLocation = lines.some(l => l.location);
  const hasCode = lines.some(l => l.item_code);

  const shown = useMemo(() => {
    let list = view === 'todo' ? lines.filter(l => stateOf(l) === 'todo') : lines;
    if (sortByLoc) list = [...list].sort((a, b) => (a.location || '~').localeCompare(b.location || '~', undefined, { numeric: true }));
    return list;
  }, [lines, view, sortByLoc]);

  // ── Save one line (instant on screen, saved in the background) ──
  const setPicked = async (line: Line, picked: number | null) => {
    if (!pickerId) return;                       // read-only view
    if (!canEdit) { toast(order?.status === 'ASSIGNED' ? '❌ Tap Start Picking first' : '❌ This order is no longer being picked'); return; }
    const before = line.picked_qty;
    live.mutate(s => ({ ...s, lines: s.lines.map(l => (l.id === line.id ? { ...l, picked_qty: picked } : l)) }));
    try {
      await api.patch(`/orders/${orderId}/lines/${line.id}`, { picker_id: pickerId, picked_qty: picked });
    } catch (err: any) {
      live.mutate(s => ({ ...s, lines: s.lines.map(l => (l.id === line.id ? { ...l, picked_qty: before } : l)) }));
      toast(`❌ ${err.response?.data?.error || 'Not saved — check connection'}`);
    }
  };
  const tap = (l: Line) => setPicked(l, stateOf(l) === 'todo' ? l.qty : null);

  const openShort = (l: Line) => {
    setShortLine(l);
    setShortQty(l.picked_qty !== null && l.picked_qty < l.qty ? fmtQty(l.picked_qty) : '');
  };
  const saveShort = () => {
    if (!shortLine) return;
    const n = Number(shortQty);
    if (shortQty === '' || !Number.isFinite(n) || n < 0) { toast('❌ Enter the quantity you collected'); return; }
    setPicked(shortLine, Math.min(n, shortLine.qty));
    setShortLine(null);
  };

  const start = async () => {
    setBusy(true);
    try {
      await api.patch(`/orders/${orderId}/start-picking`, { picker_id: pickerId });
      await live.refresh();
      toast('🚀 Picking started');
    } catch (err: any) {
      toast(`❌ ${err.response?.data?.error || 'Could not start'}`);
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setConfirmFinish(false);
    setBusy(true);
    try {
      await api.patch(`/orders/${orderId}/end-picking`, { picker_id: pickerId, cartons: cartons ? Number(cartons) : undefined });
      toast(`✅ ${order?.so_number} picked`);
      back();
    } catch (err: any) {
      toast(`❌ ${err.response?.data?.error || 'Could not finish'}`);
      setBusy(false);
    }
  };
  const askFinish = () => (todo > 0 || short > 0 ? setConfirmFinish(true) : finish());

  if (live.loading) {
    return <div className="min-h-screen bg-slate-200 p-3"><div className="max-w-3xl mx-auto h-[70vh] rounded bg-white animate-pulse" /></div>;
  }
  if (!order) {
    return (
      <div className="min-h-screen bg-blue-950 p-6 text-center text-blue-200">
        <p className="mt-20">⚠ {live.error || 'Order not found'}</p>
        <button onClick={back} className="mt-4 bg-blue-700 text-white font-bold px-5 py-3 rounded-xl">← Back</button>
      </div>
    );
  }

  const cell = 'px-2 py-2.5 align-top';

  return (
    <div className="min-h-screen bg-slate-200 pb-32">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-blue-950 text-white shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-3 py-2.5">
          <button onClick={back} aria-label="Back" className="w-10 h-10 rounded-xl bg-blue-800 hover:bg-blue-700 font-bold shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-blue-300 font-semibold">
              Sales Order · {pickerId ? 'tick items as you collect them' : 'view only'}
            </div>
            <div className="font-bold text-lg leading-tight truncate">{order.so_number}</div>
          </div>
          {lines.length > 0 && (
            <div className="text-right shrink-0">
              <div className="text-xl font-bold leading-none">{done + short}<span className="text-blue-300 text-sm">/{lines.length}</span></div>
              <div className="text-[10px] text-blue-300">items</div>
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <div className="h-1.5 bg-blue-900">
            <div className={`h-full transition-all ${short ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-2 sm:px-3 pt-3">
        {/* Start banner (if opened before starting) */}
        {pickerId && order.status === 'ASSIGNED' && order.picker_id === pickerId && (
          <button onClick={start} disabled={busy}
            className="mb-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 active:scale-[.99] text-white font-bold py-4 rounded-xl shadow">
            🚀 Start Picking
          </button>
        )}

        {/* ── The "paper" ── */}
        <div className="bg-white shadow-md rounded-sm border border-slate-300 px-3 sm:px-6 py-4 text-[13px] text-slate-900">
          <div className="text-right text-[11px] italic text-slate-500 -mt-1 mb-1">
            {pickerId ? 'Digital Copy' : 'Digital Copy · view only'}
          </div>

          {/* Header — customer left, order details right */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="text-slate-600">Customer Details :</div>
              <div className="font-bold text-[15px] leading-snug uppercase">{order.customer_name || '—'}</div>
              {order.customer_address && (
                <div className="whitespace-pre-line leading-snug text-slate-700 uppercase">{order.customer_address}</div>
              )}
              {order.customer_phone && <div className="text-slate-700 mt-0.5">{order.customer_phone}</div>}
            </div>
            <dl className="grid grid-cols-[auto_auto_1fr] gap-x-2 gap-y-0.5 self-start">
              <Row label="Fine.Order No." value={<b>{order.so_number}</b>} />
              <Row label="Dated" value={fmtDate(order.report_date || order.created_at)} />
              <Row label="Sales Rep" value={order.sales_rep || '—'} />
              <Row label="Delivery Type" value={
                <span className={`inline-block px-2 py-px rounded font-bold text-xs ${DELIVERY_STYLE[order.delivery_type] || 'bg-blue-50 text-blue-700'}`}>
                  {order.delivery_type}
                </span>} />
              {order.order_type && <Row label="Note" value={order.order_type} />}
            </dl>
          </div>

          {/* Toolbar */}
          {lines.length > 0 && (
            <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar">
              <Tab active={view === 'all'} onClick={() => setView('all')}>All {lines.length}</Tab>
              <Tab active={view === 'todo'} onClick={() => setView('todo')}>To collect {todo}</Tab>
              {hasLocation && <Tab active={sortByLoc} onClick={() => setSortByLoc(v => !v)}>📍 By location</Tab>}
              <span className="ml-auto shrink-0 text-xs">
                {done > 0 && <span className="text-green-700 font-semibold">{done} ✓</span>}
                {short > 0 && <span className="text-amber-700 font-semibold ml-2">{short} short</span>}
              </span>
            </div>
          )}

          {/* Items table */}
          <table className="w-full mt-2 border-collapse">
            <thead>
              <tr className="border-y-2 border-slate-800 text-[11px] font-bold text-left">
                <th className={`${cell} w-8`}>S.N.</th>
                {hasCode && <th className={`${cell} hidden sm:table-cell`}>Code</th>}
                <th className={cell}>Description of Goods</th>
                <th className={`${cell} text-right whitespace-nowrap`}>Qty. Unit</th>
                {hasLocation && <th className={`${cell} hidden sm:table-cell`}>Location</th>}
                <th className={`${cell} w-12 text-center`}>✓</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <div className="text-2xl mb-1">📋</div>
                    <b>Item list not loaded for this order.</b>
                    <div className="text-xs mt-1">Admin: re-upload today's sales order report on the Orders page to add it.
                      {pickerId && ' Meanwhile pick from the printed copy.'}</div>
                  </td>
                </tr>
              )}
              {lines.length > 0 && shown.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-green-700 font-semibold">🎉 Everything collected</td></tr>
              )}
              {shown.map(l => {
                const st = stateOf(l);
                return (
                  <tr key={l.id} onClick={() => tap(l)}
                    className={`border-b border-slate-200 ${pickerId ? 'cursor-pointer active:bg-slate-100' : ''}
                      ${st === 'done' ? 'bg-green-50' : st === 'short' ? 'bg-amber-50' : ''}`}>
                    <td className={`${cell} font-bold`}>{l.line_no}.</td>
                    {hasCode && <td className={`${cell} hidden sm:table-cell font-bold font-mono text-xs`}>{l.item_code || ''}</td>}
                    <td className={cell}>
                      {hasCode && l.item_code && <div className="sm:hidden font-mono text-[11px] font-bold text-slate-500">{l.item_code}</div>}
                      <div className={`font-bold uppercase leading-snug ${st === 'done' ? 'line-through text-slate-400' : ''}`}>{l.description}</div>
                      {l.location && <div className="sm:hidden mt-0.5 inline-block bg-blue-50 text-blue-700 px-1.5 rounded font-mono text-[11px] font-bold">📍 {l.location}</div>}
                      {st === 'short' && (
                        <div className="text-xs text-amber-800 font-semibold mt-1">Short: collected {fmtQty(l.picked_qty!)} of {fmtQty(l.qty)}</div>
                      )}
                      {canEdit && st !== 'done' && (
                        <button onClick={e => { e.stopPropagation(); openShort(l); }}
                          className="mt-1 text-[11px] font-semibold text-amber-700 underline underline-offset-2">
                          {st === 'short' ? 'Edit short qty' : 'Not enough stock?'}
                        </button>
                      )}
                    </td>
                    <td className={`${cell} text-right whitespace-nowrap`}>
                      <span className={`text-lg font-bold ${st === 'done' ? 'text-green-700' : ''}`}>{fmtQty(l.qty)}</span>
                      <span className="text-xs font-semibold ml-1">{l.unit || 'Pcs'}</span>
                    </td>
                    {hasLocation && <td className={`${cell} hidden sm:table-cell font-bold font-mono text-xs`}>{l.location || ''}</td>}
                    <td className={`${cell} text-center`}>
                      <span className={`inline-flex w-8 h-8 rounded-md border-2 items-center justify-center text-base font-bold
                        ${st === 'done' ? 'bg-green-600 border-green-600 text-white'
                          : st === 'short' ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-400 text-transparent'}`}>
                        {st === 'short' ? '!' : '✓'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-800 font-bold">
                  <td colSpan={2 + (hasCode ? 1 : 0)} className={`${cell} text-right`}>Total Qty</td>
                  <td className={`${cell} text-right`}>{fmtQty(totalQty)}</td>
                  <td colSpan={1 + (hasLocation ? 1 : 0)} />
                </tr>
              </tfoot>
            )}
          </table>

          {/* Footer — like the bottom of the printed copy */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 text-center text-xs">
            <Sign label="Taken By">
              <b>{order.picker_name || '—'}</b>
              {order.picker_end && <div className="text-[10px] text-slate-500">{fmtTime(order.picker_end)}</div>}
            </Sign>
            <Sign label="Checked By/Date"><span className="text-slate-300">—</span></Sign>
            <Sign label="Authorized By"><span className="text-slate-300">—</span></Sign>
            <Sign label="No of Carton">
              {canEdit ? (
                <input type="number" inputMode="numeric" min={0} value={cartons} onChange={e => setCartons(e.target.value)}
                  onClick={e => e.stopPropagation()} placeholder="0"
                  className="w-16 text-center font-bold text-base border-b-2 border-slate-400 focus:border-blue-600 focus:outline-none" />
              ) : <b>{order.cartons ?? '—'}</b>}
            </Sign>
          </div>
        </div>
      </div>

      {/* Finish bar */}
      {canEdit && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-3 pb-2">
          <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-sm">
              {lines.length > 0 ? (
                <>
                  <div className="font-bold text-slate-900">{done + short} of {lines.length} items</div>
                  <div className="text-xs text-slate-500">{todo ? `${todo} still to collect` : short ? `${short} short` : 'All collected'}</div>
                </>
              ) : <div className="text-slate-500 text-xs">Finish when the order is picked</div>}
            </div>
            <button onClick={askFinish} disabled={busy}
              className={`shrink-0 font-bold px-5 py-3.5 rounded-xl text-white active:scale-95 transition-all disabled:opacity-50
                ${todo === 0 && lines.length ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              ✅ Finish Picking
            </button>
          </div>
        </div>
      )}
      {pickerId && ['PICKED', 'CHECKING', 'DONE'].includes(order.status) && (
        <div className="max-w-3xl mx-auto px-3 mt-3">
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-semibold">
            ✅ Picking completed — this copy is read-only now.
          </div>
        </div>
      )}

      {/* Short-quantity dialog */}
      {shortLine && (
        <Dialog onClose={() => setShortLine(null)}>
          <h3 className="text-lg font-bold text-slate-900">How many did you collect?</h3>
          <p className="text-sm text-slate-600 mt-1">{shortLine.description}</p>
          <p className="text-xs text-slate-400 mt-0.5">Ordered: {fmtQty(shortLine.qty)} {shortLine.unit || 'Pcs'}</p>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => setShortQty(q => String(Math.max(0, (Number(q) || 0) - 1)))}
              className="w-14 h-14 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700">−</button>
            <input type="number" inputMode="decimal" min={0} max={shortLine.qty} autoFocus value={shortQty}
              onChange={e => setShortQty(e.target.value)} placeholder="0"
              className="flex-1 min-w-0 h-14 text-center text-2xl font-bold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400" />
            <button onClick={() => setShortQty(q => String(Math.min(shortLine.qty, (Number(q) || 0) + 1)))}
              className="w-14 h-14 rounded-xl bg-slate-100 text-2xl font-bold text-slate-700">+</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Enter 0 if none were available.</p>
          <div className="flex gap-2 mt-4">
            {shortLine.picked_qty !== null && (
              <button onClick={() => { setPicked(shortLine, null); setShortLine(null); }}
                className="bg-slate-100 text-slate-700 font-semibold px-4 py-3.5 rounded-xl text-sm">Clear</button>
            )}
            <button onClick={() => setShortLine(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-3.5 rounded-xl text-sm">Cancel</button>
            <button onClick={saveShort} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm">Save short</button>
          </div>
        </Dialog>
      )}

      {/* Finish with missing items? */}
      {confirmFinish && (
        <Dialog onClose={() => setConfirmFinish(false)}>
          <h3 className="text-lg font-bold text-slate-900">Finish picking {order.so_number}?</h3>
          <div className="text-sm text-slate-600 mt-2 space-y-1">
            {todo > 0 && <p className="text-red-700 font-semibold">⚠ {todo} item{todo === 1 ? '' : 's'} not ticked yet.</p>}
            {short > 0 && <p className="text-amber-700 font-semibold">{short} item{short === 1 ? '' : 's'} marked short.</p>}
            <p>The checker will see this.</p>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setConfirmFinish(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-3.5 rounded-xl text-sm">Keep picking</button>
            <button onClick={finish} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-sm">Finish anyway</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-600 whitespace-nowrap">{label}</dt>
      <dd className="text-slate-600">:</dd>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

function Sign({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="min-h-[2.5rem] flex flex-col items-center justify-end">{children}</div>
      <div className="w-full border-t border-slate-400 mt-1 pt-1 text-slate-600">{label}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95
        ${active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}>
      {children}
    </button>
  );
}

function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
