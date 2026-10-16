const pool = require('./db');

// Runs when the server starts. Every statement is idempotent
// (IF NOT EXISTS), so it is safe on every deploy — no manual SQL in Neon needed.
const STATEMENTS = [
  // Picker acknowledgement signatures — one row per signature taken.
  // IDs are stored as text so this works whatever type the existing tables use.
  `CREATE TABLE IF NOT EXISTS picker_signoffs (
     id          SERIAL PRIMARY KEY,
     picker_id   TEXT        NOT NULL,
     picker_name TEXT,
     department  TEXT        NOT NULL,
     order_ids   TEXT[]      NOT NULL,
     so_numbers  TEXT[]      NOT NULL,
     signature   TEXT        NOT NULL,
     signed_by   TEXT,
     signed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_signoffs_picker   ON picker_signoffs (picker_id, signed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_signoffs_orders   ON picker_signoffs USING GIN (order_ids)`,

  // Cancelled orders: remember who/when and the status before cancelling (for Restore)
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_before_cancel TEXT`,
  // If the status column is a Postgres enum, add the new value
  `DO $$
   DECLARE t regtype;
   BEGIN
     SELECT a.atttypid::regtype INTO t FROM pg_attribute a
      WHERE a.attrelid = 'orders'::regclass AND a.attname = 'status';
     IF EXISTS (SELECT 1 FROM pg_type WHERE oid = t AND typtype = 'e') THEN
       EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', t, 'CANCELLED');
     END IF;
   END $$`,
  // If a CHECK constraint limits status values and doesn't allow CANCELLED, widen it
  `DO $$
   DECLARE r record;
   BEGIN
     FOR r IN SELECT conname FROM pg_constraint
               WHERE conrelid = 'orders'::regclass AND contype = 'c'
                 AND pg_get_constraintdef(oid) ILIKE '%status%'
                 AND pg_get_constraintdef(oid) ILIKE '%UNASSIGNED%'
                 AND pg_get_constraintdef(oid) NOT ILIKE '%CANCELLED%'
     LOOP
       EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', r.conname);
       EXECUTE format('ALTER TABLE orders ADD CONSTRAINT %I CHECK (status IN '
         '(''UNASSIGNED'',''ASSIGNED'',''PICKING'',''PICKED'',''CHECKING'',''DONE'',''CANCELLED'')) NOT VALID', r.conname);
     END LOOP;
   END $$`,

  // Sales order lines — the digital pick list (one row per item)
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_rep TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS report_date DATE`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cartons INT`,
  `CREATE TABLE IF NOT EXISTS order_lines (
     id          SERIAL PRIMARY KEY,
     order_id    TEXT        NOT NULL,
     line_no     INT         NOT NULL,
     item_code   TEXT,
     description TEXT        NOT NULL,
     qty         NUMERIC     NOT NULL DEFAULT 0,
     unit        TEXT,
     location    TEXT,
     picked_qty  NUMERIC,
     picked_at   TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines (order_id, line_no)`,

  // Speed up the daily dashboards
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_picker_id  ON orders (picker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders (status)`,
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = async function migrate(attempt = 1) {
  try {
    await pool.query('SELECT 1');   // database reachable? (Neon may be waking up)
  } catch (err) {
    if (attempt >= 6) return console.error('⚠️  Migrations skipped — database unreachable:', err.message);
    await sleep(5000 * attempt);
    return migrate(attempt + 1);
  }

  let failed = 0;
  for (const sql of STATEMENTS) {
    try {
      await pool.query(sql);
    } catch (err) {
      failed++;
      console.error('⚠️  Migration step failed:', err.message);
    }
  }
  console.log(failed ? `⚠️  Migrations finished with ${failed} error(s)` : '✅ Database migrations checked');
};
