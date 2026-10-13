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
