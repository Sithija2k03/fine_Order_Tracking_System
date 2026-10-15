import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/index';
import { useLive } from '../../lib/useLive';
import { deptLabel } from '../../lib/dept';
import { useToast } from '../../components/Toast';
import { downloadSignoffReport } from '../../lib/exportReport';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';

interface BoardOrder { id: string; so_number: string; status: string; size: string; delivery_type: string; }
interface BoardPicker {
  picker_id: string;
  picker_name: string;
  orders: BoardOrder[];
  signoff: { id: number; signed_by: string | null; signed_at: string; order_count: number } | null;
  new_order_ids: string[];
}
interface Board { date: string; pickers: BoardPicker[]; }
interface SignoffRecord {
  id: number; picker_name: string; signed_by: string | null; signed_at: string;
  so_numbers: string[]; signature: string;
}

const todayISO = () => new Date().toISOString().split('T')[0];
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateText = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

type Status = 'pending' | 'new' | 'signed';
const statusOf = (p: BoardPicker): Status =>
  !p.signoff ? 'pending' : p.new_order_ids.length ? 'new' : 'signed';

export default function SignOffPage() {
  const { department } = useParams<{ department: string }>();
  const dept = department || 'machinery';
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const pickerId = params.get('picker');
  const [date, setDate] = useState(params.get('date') || todayISO());

  const { data, loading, error, refresh, mutate } =
    useLive<Board>(`/signoffs/board?department=${dept}&date=${date}`, 20000);

  // Unsigned first, then "new orders", then signed — the next job is always on top
  const pickers = useMemo(() => {
    const rank: Record<Status, number> = { pending: 0, new: 1, signed: 2 };
    return [...(data?.pickers || [])].sort((a, b) =>
      rank[statusOf(a)] - rank[statusOf(b)] || a.picker_name.localeCompare(b.picker_name));
  }, [data]);

  const selected = pickers.find(p => p.picker_id === pickerId) || null;
  const open  = (id: string) => setParams(p => { p.set('picker', id); return p; });
  const close = () => setParams(p => { p.delete('picker'); return p; });

  const counts = {
    total:   pickers.length,
    signed:  pickers.filter(p => statusOf(p) === 'signed').length,
    pending: pickers.filter(p => statusOf(p) !== 'signed').length,
  };

  if (selected) {
    return (
      <SignSheet
        key={selected.picker_id}
        picker={selected}
        dept={dept}
        date={date}
        nextPicker={pickers.find(p => p.picker_id !== selected.picker_id && statusOf(p) !== 'signed') || null}
        onBack={close}
        onOpen={open}
        onSigned={(saved) => {
          // Update the board immediately, then confirm with the server
          mutate(b => ({
            ...b,
            pickers: b.pickers.map(p => p.picker_id !== selected.picker_id ? p : {
              ...p,
              signoff: { id: saved.id, signed_by: saved.signed_by, signed_at: saved.signed_at, order_count: saved.order_ids.length },
              new_order_ids: p.orders.filter(o => !saved.order_ids.includes(o.id)).map(o => o.id),
            }),
          }));
          toast(`✅ Signed by ${selected.picker_name}`);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="bg-blue-900 rounded-2xl p-4 md:p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest">{deptLabel(dept)}</p>
              <h1 className="text-2xl font-bold text-white mt-1">✍️ Picker Sign-off</h1>
              <p className="text-blue-300 text-sm mt-1">Tap a picker, let them check the list and sign.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="px-3 py-2 bg-blue-800 text-white border border-blue-600 rounded-xl text-sm focus:outline-none" />
              <button onClick={async () => {
                  toast('⏳ Preparing report…', { type: 'info', ms: 1500 });
                  try { await downloadSignoffReport(dept, date); } catch (err: any) { toast(`❌ ${err.message}`); }
                }}
                className="bg-white hover:bg-blue-50 active:scale-95 text-blue-900 font-bold px-3 py-2 rounded-xl text-sm whitespace-nowrap">
                📥 Export
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <MiniStat value={counts.total}   label="Pickers"  className="text-white" />
            <MiniStat value={counts.pending} label="To sign"  className="text-orange-300" />
            <MiniStat value={counts.signed}  label="Signed"   className="text-green-300" />
          </div>
        </div>

        {error && <div className="bg-red-600 text-white rounded-xl px-4 py-3 mb-3 text-sm font-semibold">❌ {error}</div>}

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-blue-900/60 animate-pulse" />)}
          </div>
        )}

        {!loading && pickers.length === 0 && (
          <div className="bg-blue-900 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-blue-200 font-semibold">No orders assigned to pickers{date === todayISO() ? ' today' : ' on this day'}</p>
            <button onClick={() => navigate(`/admin/${dept}/orders`)}
              className="mt-4 bg-blue-500 hover:bg-blue-400 text-white font-bold px-5 py-3 rounded-xl text-sm">
              Go to Orders to assign
            </button>
          </div>
        )}

        <div className="space-y-2">
          {pickers.map(p => {
            const st = statusOf(p);
            return (
              <button key={p.picker_id} onClick={() => open(p.picker_id)}
                className={`w-full text-left rounded-2xl p-4 flex items-center gap-3 active:scale-[.99] transition-all
                  ${st === 'signed' ? 'bg-blue-900 hover:bg-blue-800' : 'bg-white hover:bg-blue-50'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0
                  ${st === 'signed' ? 'bg-green-500/20 text-green-300' : 'bg-blue-100 text-blue-700'}`}>
                  {st === 'signed' ? '✓' : p.picker_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-lg truncate ${st === 'signed' ? 'text-white' : 'text-blue-900'}`}>{p.picker_name}</div>
                  <div className={`text-sm ${st === 'signed' ? 'text-blue-300' : 'text-blue-500'}`}>
                    {p.orders.length} order{p.orders.length === 1 ? '' : 's'}
                    {p.signoff && <> · signed {time(p.signoff.signed_at)}</>}
                  </div>
                </div>
                {st === 'pending' && <Badge className="bg-orange-100 text-orange-700">Sign now ›</Badge>}
                {st === 'new'     && <Badge className="bg-amber-100 text-amber-800">+{p.new_order_ids.length} new · re-sign ›</Badge>}
                {st === 'signed'  && <Badge className="bg-green-500/20 text-green-300">Signed</Badge>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── One picker's acknowledgement sheet ───────────────────────────────
function SignSheet({ picker, dept, date, nextPicker, onBack, onOpen, onSigned }: {
  picker: BoardPicker; dept: string; date: string; nextPicker: BoardPicker | null;
  onBack: () => void; onOpen: (id: string) => void;
  onSigned: (saved: { id: number; signed_by: string | null; signed_at: string; order_ids: string[] }) => void;
}) {
  const toast = useToast();
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSigned, setJustSigned] = useState(false);
  const status = statusOf(picker);
  const [signing, setSigning] = useState(status !== 'signed');

  // The existing signature (image) — only loaded when viewing a signed sheet
  const { data: record } = useLive<SignoffRecord>(
    !signing && picker.signoff ? `/signoffs/${picker.signoff.id}` : null);

  const newIds = new Set(picker.new_order_ids);
  const showNew = !!picker.signoff && newIds.size > 0;

  const save = async () => {
    if (!pad.current || pad.current.isEmpty()) { toast('❌ Please sign in the box first'); return; }
    setSaving(true);
    try {
      const res = await api.post('/signoffs', {
        picker_id: picker.picker_id,
        department: dept,
        order_ids: picker.orders.map(o => o.id),
        signature: pad.current.toDataURL(),
      });
      setJustSigned(true);
      onSigned(res.data);
    } catch (err: any) {
      toast(`❌ ${err.response?.data?.error || 'Could not save — try again'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Success screen — straight on to the next picker ──
  if (justSigned) {
    return (
      <div className="min-h-screen bg-blue-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 text-4xl flex items-center justify-center mx-auto">✓</div>
          <h2 className="text-2xl font-bold text-blue-900 mt-4">Signed</h2>
          <p className="text-blue-600 mt-1">{picker.picker_name} · {picker.orders.length} orders</p>
          <div className="flex flex-col gap-2 mt-6">
            {nextPicker && (
              <button onClick={() => onOpen(nextPicker.picker_id)}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 rounded-xl text-base transition-all">
                Next: {nextPicker.picker_name} ›
              </button>
            )}
            <button onClick={onBack}
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3 rounded-xl text-sm">
              {nextPicker ? 'Back to list' : '✓ All done — back to list'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 md:p-6 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto bg-white md:rounded-3xl min-h-screen md:min-h-0 flex flex-col print:rounded-none">

        {/* Top bar */}
        <div className="flex items-center gap-3 p-4 border-b border-blue-100 print:hidden">
          <button onClick={onBack} className="w-10 h-10 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-blue-400 text-[11px] font-semibold uppercase tracking-widest">Order acknowledgement</p>
            <h1 className="text-xl font-bold text-blue-900 truncate">{picker.picker_name}</h1>
          </div>
          {!signing && (
            <button onClick={() => window.print()}
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-3 py-2 rounded-xl text-sm">🖨 Print</button>
          )}
        </div>

        {/* Printable heading */}
        <div className="hidden print:block px-6 pt-6">
          <h1 className="text-2xl font-bold">FINE Enterprises — Order Acknowledgement</h1>
          <p className="mt-1">Picker: <b>{picker.picker_name}</b></p>
        </div>

        <div className="p-4 md:p-6 flex-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-600 mb-3">
            <span>📅 {dateText(date)}</span>
            <span>{deptLabel(dept)}</span>
            <span className="font-bold text-blue-900">{picker.orders.length} orders</span>
          </div>

          {showNew && signing && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-sm mb-3">
              Signed earlier at {time(picker.signoff!.signed_at)} — <b>{newIds.size} new order{newIds.size === 1 ? '' : 's'}</b> assigned since. Please sign again for the full list.
            </div>
          )}

          {/* Order list */}
          <div className="border border-blue-100 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-50 text-blue-500 text-xs text-left">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">SO Number</th>
                  <th className="px-3 py-2 text-center">Size</th>
                  <th className="px-3 py-2">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {picker.orders.map((o, i) => (
                  <tr key={o.id} className={`border-t border-blue-50 ${showNew && newIds.has(o.id) ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-2.5 text-blue-300 font-mono text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 font-bold text-blue-900">
                      {o.so_number}
                      {showNew && newIds.has(o.id) && (
                        <span className="ml-2 bg-amber-200 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded">NEW</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold text-blue-700">{o.size}</td>
                    <td className="px-3 py-2.5 text-blue-600">{o.delivery_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {signing ? (
            <div className="mt-5">
              <p className="text-blue-900 text-sm mb-2">
                I, <b>{picker.picker_name}</b>, confirm I have received the <b>{picker.orders.length}</b> order{picker.orders.length === 1 ? '' : 's'} above for picking.
              </p>
              <SignaturePad ref={pad} onChange={setHasInk} />
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-blue-500 text-xs font-semibold uppercase tracking-widest mb-2">Signature</p>
              <div className="border border-blue-100 rounded-2xl p-3 bg-white">
                {record?.signature
                  ? <img src={record.signature} alt={`Signature of ${picker.picker_name}`} className="max-h-40 mx-auto" />
                  : <div className="h-32 animate-pulse bg-blue-50 rounded-xl" />}
              </div>
              <p className="text-blue-600 text-sm mt-2">
                ✓ Signed at <b>{time(picker.signoff!.signed_at)}</b>
                {picker.signoff!.signed_by && <> · collected by {picker.signoff!.signed_by}</>}
              </p>
            </div>
          )}
        </div>

        {/* Sticky actions */}
        <div className="sticky bottom-16 md:bottom-0 bg-white border-t border-blue-100 p-4 flex gap-2 print:hidden md:rounded-b-3xl">
          {signing ? (
            <>
              <button onClick={() => pad.current?.clear()} disabled={!hasInk || saving}
                className="bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-700 font-semibold px-5 py-4 rounded-xl text-sm">
                Clear
              </button>
              {status === 'signed' && (
                <button onClick={() => setSigning(false)}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-4 py-4 rounded-xl text-sm">Cancel</button>
              )}
              <button onClick={save} disabled={!hasInk || saving}
                className="flex-1 bg-green-600 hover:bg-green-700 active:scale-95 disabled:bg-green-300 text-white font-bold py-4 rounded-xl text-base transition-all">
                {saving ? 'Saving…' : '✅ Confirm & Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setSigning(true)}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-4 py-4 rounded-xl text-sm">Re-sign</button>
              <button onClick={() => (nextPicker ? onOpen(nextPicker.picker_id) : onBack())}
                className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 rounded-xl text-base transition-all">
                {nextPicker ? `Next: ${nextPicker.picker_name} ›` : 'Back to list'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="bg-blue-800 rounded-xl p-2.5 text-center">
      <div className={`text-xl font-bold ${className}`}>{value}</div>
      <div className="text-blue-300 text-[11px]">{label}</div>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${className}`}>{children}</span>;
}
