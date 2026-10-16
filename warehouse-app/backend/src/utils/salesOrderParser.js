const ExcelJS = require('exceljs');

// ─────────────────────────────────────────────────────────────────────
// Sales Order report parser
//
// The ERP "Sales Orders" report lists one row per line item, but only the
// FIRST row of each order carries the header fields (Date, Type, Vch/Bill No.,
// Sales Man, Particulars ...). The rows below it are blank in those columns
// and belong to the same order. This parser:
//   1. finds the header row (so extra title rows above it don't matter),
//   2. fills the order fields down onto the blank rows below,
//   3. normalises the delivery type (G → Giving, etc.),
//   4. groups the line items into one record per sales order.
// The uploaded file is never modified — everything happens in memory.
// ─────────────────────────────────────────────────────────────────────

// Delivery type codes/spellings in the report → value stored in the app.
// Keys are compared after trimming and upper-casing. Add new codes here.
const DELIVERY_TYPE_MAP = {
  'G':          'Giving',
  'GIVING':     'Giving',
  'TRANSPORT':  'Transport',
  'PRONTO':     'Pronto',
  'GUARD-ROOM': 'Guard-Room',
  'GUARD ROOM': 'Guard-Room',
  'GUARDROOM':  'Guard-Room',
};

// Suggested order size from the number of line items. The admin can change
// it in the preview before importing. Adjust the cut-offs to suit the floor.
const SIZE_RULES = [
  { max: 3,        size: 'S' },
  { max: 10,       size: 'M' },
  { max: Infinity, size: 'L' },
];

// Report column headers we read (matched case-insensitively, ignoring spaces
// and punctuation, so "Vch/Bill No." and "VCH BILL NO" both match).
const COLUMNS = {
  date:        ['date'],
  type:        ['type', 'deliverytype'],
  soNumber:    ['vchbillno', 'vchno', 'billno', 'sonumber', 'sono'],
  salesman:    ['salesman'],
  customer:    ['particulars', 'customer', 'partyname'],
  orderType:   ['ordertype'],
  address1:    ['address1', 'address'],
  address2:    ['address2'],
  address3:    ['address3'],
  address4:    ['address4'],
  mobile:      ['mobno', 'mobileno', 'mobile', 'phone', 'phoneno', 'contactno'],
  itemDetails: ['itemdetails', 'item', 'itemname'],
  qty:         ['qty', 'quantity'],
  unit:        ['unit', 'uom'],
  itemCode:    ['code', 'itemcode', 'productcode', 'partno'],
  location:    ['location', 'binlocation', 'bin', 'rack'],
  amount:      ['amount', 'value'],
};
const REQUIRED = ['soNumber', 'type'];

const keyOf = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ExcelJS returns rich text / formula / hyperlink objects for some cells.
function cellValue(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? null;              // formula
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;                           // hyperlink
    return null;
  }
  return v;
}

// The ERP fills "empty" cells with a single space, so treat whitespace as blank.
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const clean   = (v) => (isBlank(v) ? '' : String(v).trim());
const toNum   = (v) => {
  if (isBlank(v)) return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function normaliseDeliveryType(raw) {
  const value = clean(raw);
  if (!value) return '';
  const mapped = DELIVERY_TYPE_MAP[value.toUpperCase()];
  if (mapped) return mapped;
  // Unknown value (e.g. "NO DELIVERY") — keep it, in Title Case, so nothing is lost.
  return value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function suggestSize(lineCount) {
  return SIZE_RULES.find(r => lineCount <= r.max).size;
}

function toISODate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().split('T')[0];
  const s = clean(v);
  return s || null;
}

function findHeader(sheet) {
  const maxScan = Math.min(sheet.rowCount, 30);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    const map = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const k = keyOf(cellValue(cell));
      for (const [field, aliases] of Object.entries(COLUMNS)) {
        if (map[field] === undefined && aliases.includes(k)) map[field] = col;
      }
    });
    if (REQUIRED.every(f => map[f] !== undefined)) return { headerRow: r, map };
  }
  return null;
}

/**
 * Parse an uploaded Sales Order report.
 * @param {Buffer} buffer  .xlsx file contents
 * @returns {{ orders: object[], warnings: string[], totals: object }}
 */
async function parseSalesOrderReport(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('Could not read the file. Please upload the Sales Order report as an Excel (.xlsx) file.');
  }

  // Use the first sheet that has the expected headers.
  let sheet = null, header = null;
  for (const ws of workbook.worksheets) {
    const h = findHeader(ws);
    if (h) { sheet = ws; header = h; break; }
  }
  if (!sheet) {
    throw new Error('This does not look like a Sales Order report — could not find the "Vch/Bill No." and "Type" columns.');
  }

  const { headerRow, map } = header;
  const get = (row, field) => (map[field] === undefined ? null : cellValue(row.getCell(map[field])));

  const orders   = new Map();   // soNumber → order (keeps report order)
  const warnings = [];
  let current = null;           // the order the blank rows are filled down from
  let lineRows = 0;

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const so   = clean(get(row, 'soNumber')).toUpperCase();
    const item = clean(get(row, 'itemDetails'));
    const qty  = toNum(get(row, 'qty'));

    if (so) {
      // First row of an order — start (or continue, if the SO repeats) a group.
      if (!orders.has(so)) {
        orders.set(so, {
          so_number:         so,
          date:              toISODate(get(row, 'date')),
          delivery_type_raw: clean(get(row, 'type')),
          delivery_type:     normaliseDeliveryType(get(row, 'type')),
          salesman:          clean(get(row, 'salesman')),
          customer:          clean(get(row, 'customer')),
          order_type:        clean(get(row, 'orderType')),
          // Address lines, without repeats (the report often repeats the town)
          address:           [...new Set(['address1', 'address2', 'address3', 'address4']
                               .map(f => clean(get(row, f)).replace(/,{2,}/g, ',').replace(/,+\s*$/, '')).filter(Boolean))].join('\n'),
          phone:             clean(get(row, 'mobile')),
          line_count:        0,
          total_qty:         0,
          total_amount:      0,
          items:             [],
        });
      }
      current = orders.get(so);
    } else if (!item && !qty) {
      continue;   // fully blank row or a totals line — not an item
    } else if (!current) {
      warnings.push(`Row ${r}: item "${item}" appears before any sales order number and was skipped.`);
      continue;
    }
    // else: blank SO cell → fill down from `current`

    if (item || qty) {
      current.line_count   += 1;
      current.total_qty    += qty;
      current.total_amount += toNum(get(row, 'amount'));
      current.items.push({
        item,
        qty,
        unit:     clean(get(row, 'unit')),
        code:     clean(get(row, 'itemCode')),
        location: clean(get(row, 'location')),
      });
      lineRows++;
    }
  }

  const list = [...orders.values()].map(o => {
    if (!o.delivery_type) warnings.push(`${o.so_number}: delivery type is blank — please choose one before importing.`);
    return {
      ...o,
      total_amount: Math.round(o.total_amount * 100) / 100,
      size: suggestSize(o.line_count || 1),
    };
  });

  if (!list.length) throw new Error('No sales orders were found in this report.');

  return {
    orders: list,
    warnings,
    totals: { orders: list.length, line_items: lineRows, sheet: sheet.name },
  };
}

module.exports = { parseSalesOrderReport, normaliseDeliveryType, DELIVERY_TYPE_MAP, SIZE_RULES };
