import { useMemo, useRef, useState } from 'react';
import api from '../../api/index';

// One sales order as returned by POST /orders/upload/preview
interface ParsedOrder {
  so_number: string;
  date: string | null;
  delivery_type_raw: string;
  delivery_type: string;
  salesman: string;
  customer: string;
  order_type: string;
  line_count: number;
  total_qty: number;
  total_amount: number;
  size: string;
  already_exists: boolean;
  existing_status: string | null;
  existing_picker: string | null;
}

interface Row extends ParsedOrder {
  include: boolean;
  picker_id: string;
}

interface Picker { id: string; name: string; }

interface Props {
  department: string;
  pickers: Picker[];
  onClose: () => void;
  onImported: (message: string, createdIds: string[]) => void;
}

const STANDARD_TYPES = ['Giving', 'Transport', 'Pronto', 'Guard-Room'];

export default function UploadOrdersModal({ department, pickers, onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows]         = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState(0);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<'' | 'reading' | 'importing'>('');
  const [dragging, setDragging] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  // ── Step 1: send the report as-is; the server fills down and cleans it ──
  const readFile = async (file: File) => {
    setError('');
    if (!/\.xlsx$/i.test(file.name)) {
      setError('Please choose the Sales Order report Excel file (.xlsx).');
      return;
    }
    setFileName(file.name);
    setBusy('reading');
    try {
      const form = new FormData();
      form.append('file', file);
      // The shared api instance defaults to JSON, which would make axios turn the
      // FormData into JSON — override it so the file is sent as multipart.
      const res = await api.post(`/orders/upload/preview?department=${department}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRows(res.data.orders.map((o: ParsedOrder) => ({
        ...o,
        include: !o.already_exists && !!o.delivery_type,
        picker_id: '',
      })));
      setWarnings(res.data.warnings || []);
      setLineItems(res.data.totals?.line_items || 0);
    } catch (err: any) {
      setRows(null);
      setError(err.response?.data?.error || 'Could not read the report. Please try again.');
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const update = (so: string, patch: Partial<Row>) =>
    setRows(prev => prev && prev.map(r => (r.so_number === so ? { ...r, ...patch } : r)));

  const selectable = rows?.filter(r => !r.already_exists) ?? [];
  const selected   = rows?.filter(r => r.include && !r.already_exists) ?? [];
  const existing   = rows?.filter(r => r.already_exists).length ?? 0;
  // New orders first (in report order); orders already in the system go below
  const newRows      = rows?.filter(r => !r.already_exists) ?? [];
  const existingRows = rows?.filter(r => r.already_exists) ?? [];
  const allChecked = selectable.length > 0 && selected.length === selectable.length;

  const toggleAll = () =>
    setRows(prev => prev && prev.map(r => (r.already_exists ? r : { ...r, include: !allChecked })));

  // Any non-standard delivery values in the report (e.g. "No Delivery") stay selectable
  const typeOptions = useMemo(() => {
    const extra = new Set((rows ?? []).map(r => r.delivery_type).filter(t => t && !STANDARD_TYPES.includes(t)));
    return [...STANDARD_TYPES, ...extra];
  }, [rows]);

  // ── Step 2: create the selected orders ──
  const importOrders = async () => {
    if (!selected.length) return;
    const missing = selected.filter(r => !r.delivery_type || !r.size);
    if (missing.length) {
      setError(`Choose a delivery type and size for: ${missing.map(r => r.so_number).join(', ')}`);
      return;
    }
    setError('');
    setBusy('importing');
    try {
      const res = await api.post('/orders/bulk', {
        department,
        orders: selected.map(r => ({
          so_number: r.so_number,
          size: r.size,
          delivery_type: r.delivery_type,
          picker_id: r.picker_id || undefined,
        })),
      });
      const { created, skipped, orders } = res.data;
      onImported(`✅ ${created} new order${created === 1 ? '' : 's'} added on top` +
        (skipped?.length ? ` · ${skipped.length} already existed and were skipped` : ''),
        (orders || []).map((o: { id: string }) => String(o.id)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Import failed. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const cell = 'px-3 py-2 align-middle';
  const select = 'border border-blue-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-blue-500 disabled:bg-blue-50 disabled:text-blue-300';

  return (
    <div className="fixed inset-0 z-50 bg-blue-950/80 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[95vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 md:p-5 border-b border-blue-100">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-blue-900">📤 Upload Sales Order Report</h2>
            <p className="text-blue-500 text-xs md:text-sm mt-0.5">
              Upload the report exactly as it comes from the system — no need to fill down or edit it.
            </p>
          </div>
          <button onClick={onClose} disabled={busy === 'importing'}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold w-10 h-10 rounded-xl shrink-0 transition-all">
            ✕
          </button>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto flex-1">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
            onClick={() => busy || fileInput.current?.click()}
            className={`border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all
              ${rows ? 'p-3' : 'p-8 md:p-10'}
              ${dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/50'}`}
          >
            <input ref={fileInput} type="file" accept=".xlsx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
            {busy === 'reading' ? (
              <p className="text-blue-700 font-semibold">⏳ Reading {fileName}…</p>
            ) : rows ? (
              <p className="text-blue-700 text-sm">
                📄 <span className="font-semibold">{fileName}</span>
                <span className="text-blue-400"> · {lineItems} lines</span>
                <span className="text-blue-400"> · click or drop to choose a different file</span>
              </p>
            ) : (
              <>
                <div className="text-4xl mb-2">📄</div>
                <p className="text-blue-900 font-semibold">Click to choose the Sales Order report</p>
                <p className="text-blue-400 text-sm mt-1">or drag and drop the .xlsx file here</p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mt-4 text-sm font-medium">
              ❌ {error}
            </div>
          )}

          {rows && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                <Stat label="Orders in report" value={rows.length} />
                <Stat label="New orders" value={newRows.length} tone="strong" />
                <Stat label="Already in system" value={existing} tone="muted" />
                <Stat label="Selected to import" value={selected.length} tone="strong" />
              </div>

              {existing > 0 && newRows.length > 0 && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl mt-4 text-sm">
                  🆕 <b>{newRows.length} new order{newRows.length === 1 ? '' : 's'}</b> since the last upload.
                  The {existing} order{existing === 1 ? '' : 's'} already in the system will stay exactly as they are — pickers, progress and signatures unchanged.
                </div>
              )}
              {existing > 0 && newRows.length === 0 && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl mt-4 text-sm">
                  ✓ No new orders — all {existing} orders in this report are already in the system.
                </div>
              )}

              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mt-4 text-xs space-y-1">
                  {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}

              {newRows.length > 0 && (
                <div className="flex items-center justify-between gap-3 mt-4 mb-2">
                  <p className="text-blue-500 text-xs">
                    Size is suggested from the number of lines (1–3 S, 4–10 M, 11+ L). Untick orders that
                    don't belong to this department.
                  </p>
                  <button onClick={toggleAll}
                    className="md:hidden shrink-0 bg-blue-50 text-blue-700 font-semibold px-3 py-2 rounded-lg text-xs">
                    {allChecked ? 'Untick all' : 'Tick all'}
                  </button>
                </div>
              )}

              {/* New orders — phone cards */}
              <div className="md:hidden space-y-2">
                {newRows.map(r => (
                  <div key={r.so_number}
                    className={`border rounded-xl p-3 transition-all ${r.include ? 'border-blue-300 bg-white' : 'border-blue-100 bg-blue-50/50 opacity-60'}`}>
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={r.include}
                        onChange={e => update(r.so_number, { include: e.target.checked })}
                        className="w-5 h-5 mt-0.5 accent-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-blue-900">{r.so_number}</span>
                          {existing > 0 && <NewBadge />}
                        </div>
                        <div className="text-xs text-blue-600 truncate">{r.customer || '—'}</div>
                        <div className="text-[11px] text-blue-400">{r.salesman || '—'} · {r.line_count} lines · qty {r.total_qty}</div>
                      </div>
                    </label>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <select value={r.delivery_type} onChange={e => update(r.so_number, { delivery_type: e.target.value })}
                        className={`${select} py-2 ${!r.delivery_type ? 'border-red-400' : ''}`}>
                        <option value="">Delivery</option>
                        {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={r.size} onChange={e => update(r.so_number, { size: e.target.value })} className={`${select} py-2`}>
                        <option value="S">Size S</option>
                        <option value="M">Size M</option>
                        <option value="L">Size L</option>
                      </select>
                      <select value={r.picker_id} onChange={e => update(r.so_number, { picker_id: e.target.value })} className={`${select} py-2`}>
                        <option value="">Picker later</option>
                        {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* New orders — desktop table */}
              {newRows.length > 0 && (
              <div className="hidden md:block border border-blue-100 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-600 text-white text-left text-xs">
                      <th className={cell}>
                        <input type="checkbox" checked={allChecked} onChange={toggleAll}
                          className="w-4 h-4 accent-blue-300" title="Select all" />
                      </th>
                      <th className={cell}>SO #</th>
                      <th className={cell}>Customer</th>
                      <th className={cell}>Sales Man</th>
                      <th className={`${cell} text-right`}>Lines</th>
                      <th className={`${cell} text-right`}>Qty</th>
                      <th className={cell}>Delivery</th>
                      <th className={cell}>Size</th>
                      <th className={cell}>Picker (optional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newRows.map((r, i) => (
                        <tr key={r.so_number}
                          className={`${i % 2 ? 'bg-blue-50' : 'bg-white'} ${!r.include ? 'opacity-50' : ''}`}>
                          <td className={cell}>
                            <input type="checkbox" checked={r.include}
                              onChange={e => update(r.so_number, { include: e.target.checked })}
                              className="w-4 h-4 accent-blue-600" />
                          </td>
                          <td className={`${cell} font-bold whitespace-nowrap text-blue-900`}>
                            {r.so_number}
                            {existing > 0 && <span className="ml-2"><NewBadge /></span>}
                          </td>
                          <td className={`${cell} max-w-[11rem] truncate text-blue-800`} title={r.customer}>{r.customer || '—'}</td>
                          <td className={`${cell} whitespace-nowrap text-blue-700`}>{r.salesman || '—'}</td>
                          <td className={`${cell} text-right font-mono`}>{r.line_count}</td>
                          <td className={`${cell} text-right font-mono`}>{r.total_qty}</td>
                          <td className={cell}>
                            <select value={r.delivery_type}
                              onChange={e => update(r.so_number, { delivery_type: e.target.value })}
                              className={`${select} ${!r.delivery_type ? 'border-red-400' : ''}`}>
                              <option value="">Select</option>
                              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            {r.delivery_type_raw && r.delivery_type_raw !== r.delivery_type && (
                              <div className="text-[10px] text-blue-400 mt-0.5">from "{r.delivery_type_raw}"</div>
                            )}
                          </td>
                          <td className={cell}>
                            <select value={r.size}
                              onChange={e => update(r.so_number, { size: e.target.value })}
                              className={select}>
                              <option value="S">S</option>
                              <option value="M">M</option>
                              <option value="L">L</option>
                            </select>
                          </td>
                          <td className={cell}>
                            <select value={r.picker_id}
                              onChange={e => update(r.so_number, { picker_id: e.target.value })}
                              className={select}>
                              <option value="">Assign later</option>
                              {pickers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}

              {/* Orders already in the system — read-only, collapsed by default */}
              {existingRows.length > 0 && (
                <div className="mt-4 border border-blue-100 rounded-xl overflow-hidden">
                  <button onClick={() => setShowExisting(v => !v)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-left">
                    <span className="text-sm text-blue-700">
                      <b>{existingRows.length}</b> already in the system — kept as they are
                    </span>
                    <span className="text-blue-500 text-xs font-semibold shrink-0">{showExisting ? 'Hide ▲' : 'Show ▼'}</span>
                  </button>
                  {showExisting && (
                    <div className="divide-y divide-blue-50 max-h-72 overflow-y-auto">
                      {existingRows.map(r => (
                        <div key={r.so_number} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <span className="font-semibold text-blue-400 whitespace-nowrap">{r.so_number}</span>
                          <span className="flex-1 min-w-0 truncate text-blue-300 text-xs">{r.customer}</span>
                          <span className="shrink-0 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md text-[10px] font-bold">{r.existing_status}</span>
                          <span className="shrink-0 w-20 text-right text-xs text-blue-500 truncate">{r.existing_picker ? `🧳 ${r.existing_picker}` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 md:p-5 border-t border-blue-100">
          <button onClick={onClose} disabled={busy === 'importing'}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-6 py-3 rounded-xl text-sm transition-all">
            Cancel
          </button>
          {rows && (
            <button onClick={importOrders} disabled={!selected.length || !!busy}
              className="bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-blue-300 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all">
              {busy === 'importing' ? 'Importing…' : `✅ Import ${selected.length} order${selected.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewBadge() {
  return <span className="bg-green-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide">NEW</span>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'muted' | 'strong' }) {
  const color = tone === 'strong' ? 'text-blue-600' : tone === 'muted' ? 'text-blue-300' : 'text-blue-900';
  return (
    <div className="bg-blue-50 rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-blue-500 text-[11px] font-medium mt-0.5">{label}</div>
    </div>
  );
}
