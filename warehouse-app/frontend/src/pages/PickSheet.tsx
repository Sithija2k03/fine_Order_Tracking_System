import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/index';
import { useLive } from '../lib/useLive';
import { useToast } from '../components/Toast';

// ─────────────────────────────────────────────────────────────────────
// Digital sales order — the picker's pick list.
// Laid out like the printed BusyWin sales order; the picker taps each item
// as it's collected (or records a short quantity), then finishes picking.
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
  sales_rep: string | null;
  created_at: string;
  picker_id: string | null;
  picker_name: string | null;
}
interface Sheet { order: SheetOrder; lines: Line[]; }

const DELIVERY_STYLE: Record<string, string> = {
  Pronto: 'bg-red-100 text-red-700', Transport: 'bg-purple-100 text-purple-700',
  'Guard-Room': 'bg-amber-100 text-amber-800', Giving: 'bg-slate-100 text-slate-700',
};
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
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
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [busy, setBusy] = useState(false);

  // Pickers come from their dashboard; checkers/admin open it read-only via /sheet/:orderId
  const back = () => (pickerId ? navigate(`/picker/${pickerId}?dept=${dept}`, { replace: true }) : navigate(-1));
  const canEdit = order?.status === 'PICKING' && order?.picker_id === pickerId;

  const done  = lines.filter(l => stateOf(l) === 'done').length;
  const short = lines.filter(l => stateOf(l) === 'short').length;
  const todo  = lines.length - done - short;
  const pct   = lines.length ? Math.round(((done + short) / lines.length) * 100) : 0;
  const hasLocation = lines.some(l => l.location);
  const hasCode = lines.some(l => l.item_code);

  const shown = useMemo(() => {
    let list = view === 'todo' ? lines.filter(l => stateOf(l) === 'todo') : lines;
    if (sortByLoc) list = [...list].sort((a, b) => (a.location || '~').localeCompare(b.location || '~', undefined, { numeric: true }));
    return list;
  }, [lines, view, sortByLoc]);

  // ── Save one line (instant on screen, saved in the background) ──
  const setPicked = async (line: Line, picked: number | null) => {
    if (!pickerId) return;            // read-only view (checker / admin)
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
    if (!canEdit) { tap(l); return; }
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
      await api.patch(`/orders/${orderId}/end-picking`, { picker_id: pickerId });
      toast(`✅ ${order?.so_number} picked`);
      back();
    } catch (err: any) {
      toast(`❌ ${err.response?.data?.error || 'Could not finish'}`);
      setBusy(false);
    }
  };
  const askFinish = () => (todo > 0 || short > 0 ? setConfirmFinish(true) : finish());

  if (live.loading) {
    return <div className="min-h-screen bg-slate-100 p-4"><div className="max-w-2xl mx-auto h-64 rounded-2xl bg-white animate-pulse" /></div>;
  }
  if (!order) {
    return (
      <div className="min-h-screen bg-blue-950 p-6 text-center text-blue-200">
        <p className="mt-20">⚠ {live.error || 'Order not found'}</p>
        <button onClick={back} className="mt-4 bg-blue-700 text-white font-bold px-5 py-3 rounded-xl">← Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-28">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-blue-950 text-white shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-3 py-2.5">
          <button onClick={back} aria-label="Back" className="w-10 h-10 rounded-xl bg-blue-800 hover:bg-blue-700 font-bold shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-blue-300 font-semibold">Sales Order · {pickerId ? 'Pick List' : 'View only'}</div>
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

      <div className="max-w-2xl mx-auto px-3 pt-3">
        {/* Order header — same details as the printed copy */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Customer</div>
              <div className="font-bold text-slate-900 leading-snug">{order.customer_name || '—'}</div>
            </div>
            <div className="text-right">
              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${DELIVERY_STYLE[order.delivery_type] || 'bg-blue-50 text-blue-700'}`}>
                {order.delivery_type}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            <Info label="Dated" value={new Date(order.created_at).toLocaleDateString('en-GB')} />
            <Info label="Sales Rep" value={order.sales_rep || '—'} />
            <Info label="Picker" value={order.picker_name || '—'} />
          </div>
        </div>

        {/* Start banner (if opened before starting) */}
        {order.status === 'ASSIGNED' && order.picker_id === pickerId && (
          <button onClick={start} disabled={busy}
            className="mt-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 active:scale-[.99] text-white font-bold py-4 rounded-2xl shadow">
            🚀 Start Picking
          </button>
        )}
        {pickerId && ['PICKED', 'CHECKING', 'DONE'].includes(order.status) && (
          <div className="mt-3 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-semibold">
            ✅ Picking completed — this list is read-only.
          </div>
        )}

        {lines.length === 0 ? (
          <div className="mt-3 bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 text-sm">
            No item list for this order (it was added manually or before item lists were saved).
            <br />Pick from the printed copy, then finish below.
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 mt-4 mb-2 overflow-x-auto no-scrollbar">
              <Tab active={view === 'all'} onClick={() => setView('all')}>All <b>{lines.length}</b></Tab>
              <Tab active={view === 'todo'} onClick={() => setView('todo')}>To collect <b>{todo}</b></Tab>
              {hasLocation && (
                <Tab active={sortByLoc} onClick={() => setSortByLoc(v => !v)}>📍 By location</Tab>
              )}
              <span className="ml-auto shrink-0 text-xs text-slate-500">
                {done > 0 && <span className="text-green-700 font-semibold">{done} ✓</span>}
                {short > 0 && <span className="text-amber-700 font-semibold ml-2">{short} short</span>}
              </span>
            </div>

            {/* Item lines */}
            <div className="space-y-2">
              {shown.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-green-700 font-semibold">
                  🎉 Everything collected
                </div>
              )}
              {shown.map(l => {
                const st = stateOf(l);
                return (
                  <div key={l.id}
                    className={`rounded-2xl border shadow-sm transition-all
                      ${st === 'done' ? 'bg-green-50 border-green-200' : st === 'short' ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                    <button onClick={() => tap(l)} className="w-full text-left flex items-start gap-3 p-3 active:scale-[.99]">
                      <span className={`mt-0.5 w-9 h-9 shrink-0 rounded-full border-2 flex items-center justify-center text-lg font-bold
                        ${st === 'done' ? 'bg-green-500 border-green-500 text-white'
                          : st === 'short' ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-300 text-transparent'}`}>
                        {st === 'short' ? '!' : '✓'}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
                          <span>{l.line_no}.</span>
                          {hasCode && l.item_code && <span className="font-mono text-slate-500">{l.item_code}</span>}
                          {l.location && <span className="bg-blue-50 text-blue-700 px-1.5 py-px rounded font-mono">📍 {l.location}</span>}
                        </span>
                        <span className={`block font-bold leading-snug mt-0.5 ${st === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                          {l.description}
                        </span>
                        {st === 'short' && (
                          <span className="block text-xs text-amber-800 font-semibold mt-1">
                            Short: collected {fmtQty(l.picked_qty!)} of {fmtQty(l.qty)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-2xl font-bold leading-none ${st === 'done' ? 'text-green-700' : 'text-slate-900'}`}>{fmtQty(l.qty)}</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{l.unit || 'Pcs'}</span>
                      </span>
                    </button>
                    {canEdit && st !== 'done' && (
                      <div className="flex justify-end px-3 pb-2 -mt-1">
                        <button onClick={() => openShort(l)}
                          className="text-xs font-semibold text-amber-700 hover:bg-amber-100 px-2.5 py-1 rounded-lg">
                          {st === 'short' ? 'Edit short qty' : 'Not enough stock?'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Finish bar */}
      {canEdit && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-3 pb-2">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 flex items-center gap-3">
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-slate-800 truncate">{value}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold border transition-all active:scale-95
        ${active ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-200'}`}>
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
