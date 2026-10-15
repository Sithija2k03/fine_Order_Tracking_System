const ExcelJS = require('exceljs');
const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
// Daily export (.xlsx)
//   Sheet 1 "Picker Sign-off" — one row per picker: orders assigned, orders
//            picked, when they signed, their signature image, and an empty
//            box for the HOD to sign on the printed copy.
//   Sheet 2 "Order Details"   — the order-by-order timings (previous CSV export).
// ─────────────────────────────────────────────────────────────────────

const DISPLAY_TZ = process.env.DISPLAY_TZ || 'Asia/Colombo';
const DEPT_LABEL = { machinery: 'Machinery', assembly: 'Accessories', accessories: 'Accessories' };

const fmtTime = (d) => d
  ? new Date(d).toLocaleTimeString('en-GB', { timeZone: DISPLAY_TZ, hour: '2-digit', minute: '2-digit', hour12: true })
  : '';
const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

const NAVY = 'FF0B1F4D';
const LIGHT = 'FFE8EEF9';
const thin = { style: 'thin', color: { argb: 'FFB8C4DC' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

async function loadData(date, department) {
  const params = department ? [date, department] : [date];
  const deptSql = department ? 'AND o.department = $2' : '';

  // Per picker: orders assigned and picked (cancelled orders excluded)
  const pickers = await pool.query(
    `SELECT p.id::text AS picker_id, p.name AS picker_name,
            array_agg(o.id::text) AS order_ids,
            COUNT(*)::int AS assigned,
            COUNT(*) FILTER (WHERE o.status IN ('PICKED','CHECKING','DONE'))::int AS picked
       FROM orders o JOIN pickers p ON p.id = o.picker_id
      WHERE DATE(o.created_at) = $1 ${deptSql} AND o.status <> 'CANCELLED'
      GROUP BY p.id, p.name
      ORDER BY p.name`,
    params
  );

  // Latest signature per picker covering any of that day's orders
  const allIds = pickers.rows.flatMap(r => r.order_ids);
  let signoffs = { rows: [] };
  if (allIds.length) {
    try {
      signoffs = await pool.query(
        `SELECT DISTINCT ON (picker_id) picker_id, signature, signed_at, signed_by, order_ids
           FROM picker_signoffs
          WHERE order_ids && $1::text[]
          ORDER BY picker_id, signed_at DESC`,
        [allIds]
      );
    } catch { /* sign-off table not created yet — export without signatures */ }
  }
  const sigByPicker = new Map(signoffs.rows.map(s => [s.picker_id, s]));

  const orders = await pool.query(
    `SELECT
        o.so_number, o.status, o.size, o.delivery_type, p.name AS picker_name,
        TO_CHAR(o.picker_start, 'HH24:MI:SS')       AS pick_start,
        TO_CHAR(o.picker_end,   'HH24:MI:SS')       AS pick_end,
        TO_CHAR(o.picking_duration, 'HH24:MI:SS')   AS picking_duration,
        TO_CHAR(o.idle_duration, 'HH24:MI:SS')      AS idle_time,
        c.name AS checker_name, c2.name AS checker2_name,
        TO_CHAR(o.checker_start, 'HH24:MI:SS')      AS check_start,
        TO_CHAR(o.checker_end,   'HH24:MI:SS')      AS check_end,
        TO_CHAR(o.checking_duration, 'HH24:MI:SS')  AS checking_duration,
        TO_CHAR(o.total_duration, 'HH24:MI:SS')     AS total_duration,
        o.approved_by_name
       FROM orders o
       LEFT JOIN pickers  p  ON o.picker_id   = p.id
       LEFT JOIN checkers c  ON o.checker_id  = c.id
       LEFT JOIN checkers c2 ON o.checker2_id = c2.id
      WHERE DATE(o.created_at) = $1 ${deptSql}
      ORDER BY o.created_at ASC`,
    params
  );

  return { pickers: pickers.rows, sigByPicker, orders: orders.rows };
}

function titleBlock(ws, title, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = subtitle;
  ws.getCell(2, 1).font = { size: 11, color: { argb: 'FF4D6A9C' } };
  ws.getRow(1).height = 24;
}

function headerRow(row) {
  row.height = 34;
  row.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  });
}

async function buildSignoffWorkbook({ date, department }) {
  const { pickers, sigByPicker, orders } = await loadData(date, department);
  const deptName = DEPT_LABEL[department] || department || 'All departments';
  const subtitle = `Department: ${deptName}    ·    Date: ${fmtDate(date)}    ·    Generated: ${fmtTime(new Date())}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FINE Order Tracking System';

  // ── Sheet 1: Picker Sign-off ─────────────────────────────────────
  const ws = wb.addWorksheet('Picker Sign-off', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                 margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  ws.columns = [
    { key: 'no',       width: 5 },
    { key: 'name',     width: 24 },
    { key: 'assigned', width: 13 },
    { key: 'picked',   width: 13 },
    { key: 'time',     width: 16 },
    { key: 'sig',      width: 30 },
    { key: 'hod',      width: 30 },
  ];
  titleBlock(ws, 'FINE Enterprises — Picker Sign-off Report', subtitle, 7);
  const head = ws.getRow(4);
  head.values = ['#', 'Picker Name', 'Orders Assigned', 'No. of Orders Picked', 'Signature Time', 'Picker Signature', 'HOD Signature'];
  headerRow(head);

  const ROW_H = 48;                       // points; signature images fit inside
  pickers.forEach((p, i) => {
    const sig = sigByPicker.get(p.picker_id);
    const r = ws.getRow(5 + i);
    r.values = [i + 1, p.picker_name, p.assigned, p.picked, sig ? fmtTime(sig.signed_at) : 'Not signed', '', ''];
    r.height = ROW_H;
    r.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > 7) return;
      c.border = box;
      c.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : 'center', indent: col === 2 ? 1 : 0 };
      if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FD' } };
    });
    r.getCell(2).font = { bold: true, color: { argb: NAVY } };
    if (!sig) r.getCell(5).font = { italic: true, color: { argb: 'FFB45309' } };

    if (sig?.signature?.startsWith('data:image/png;base64,')) {
      const imageId = wb.addImage({ base64: sig.signature, extension: 'png' });
      // Column F (index 5, zero-based), centred inside the cell
      ws.addImage(imageId, {
        tl: { col: 5 + 0.08, row: 4 + i + 0.08 },
        ext: { width: 175, height: 56 },
        editAs: 'oneCell',
      });
    }
  });

  // Totals + HOD block
  const totalRowIdx = 5 + pickers.length;
  const tr = ws.getRow(totalRowIdx);
  tr.values = ['', 'Total', pickers.reduce((n, p) => n + p.assigned, 0), pickers.reduce((n, p) => n + p.picked, 0),
               `${pickers.filter(p => sigByPicker.has(p.picker_id)).length}/${pickers.length} signed`, '', ''];
  tr.height = 22;
  tr.eachCell({ includeEmpty: true }, (c, col) => {
    if (col > 7) return;
    c.font = { bold: true, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    c.border = box;
    c.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : 'center', indent: col === 2 ? 1 : 0 };
  });

  const hodRow = totalRowIdx + 2;
  ws.getCell(hodRow, 2).value = 'HOD Name: ______________________________';
  ws.getCell(hodRow, 5).value = 'Date: __________________';
  ws.getCell(hodRow + 2, 2).value = 'HOD Signature: __________________________';
  [hodRow, hodRow + 2].forEach(r => ws.getRow(r).font = { color: { argb: NAVY } });

  if (!pickers.length) {
    ws.mergeCells(5, 1, 5, 7);
    ws.getCell(5, 1).value = 'No orders were assigned to pickers on this day.';
    ws.getCell(5, 1).alignment = { horizontal: 'center' };
  }

  // ── Sheet 2: Order Details ───────────────────────────────────────
  const wd = wb.addWorksheet('Order Details', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  const cols = [
    ['SO Number', 'so_number', 18], ['Status', 'status', 12], ['Size', 'size', 6], ['Delivery', 'delivery_type', 12],
    ['Picker', 'picker_name', 16], ['Pick Start', 'pick_start', 10], ['Pick End', 'pick_end', 10],
    ['Picking Time', 'picking_duration', 12], ['Idle Time', 'idle_time', 10], ['Checker 1', 'checker_name', 14],
    ['Checker 2', 'checker2_name', 14], ['Check Start', 'check_start', 10], ['Check End', 'check_end', 10],
    ['Checking Time', 'checking_duration', 12], ['Total Time', 'total_duration', 11], ['Approved By', 'approved_by_name', 14],
  ];
  wd.columns = cols.map(([, key, width]) => ({ key, width }));
  titleBlock(wd, 'FINE Enterprises — Order Details', subtitle, cols.length);
  const dh = wd.getRow(4);
  dh.values = cols.map(([h]) => h);
  headerRow(dh);
  orders.forEach((o, i) => {
    const r = wd.getRow(5 + i);
    r.values = cols.map(([, key]) => o[key] ?? '');
    r.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > cols.length) return;
      c.border = box;
      c.alignment = { vertical: 'middle', horizontal: col === 1 || col === 5 ? 'left' : 'center' };
    });
    if (o.status === 'CANCELLED') r.font = { color: { argb: 'FFB91C1C' }, strike: true };
  });

  return wb;
}

module.exports = { buildSignoffWorkbook };
