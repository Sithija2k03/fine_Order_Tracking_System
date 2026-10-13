const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

const today = () => new Date().toISOString().split('T')[0];

// ── Sign-off board ────────────────────────────────────────────────────
// Every picker with orders on the given day, their orders, and their latest
// signature (if any). Orders assigned after that signature are listed in
// `new_order_ids` so the admin knows a fresh signature is needed.
router.get('/board', auth, async (req, res) => {
  const { department } = req.query;
  const date = req.query.date || today();
  if (!department) return res.status(400).json({ error: 'Department is required' });

  try {
    const orders = await pool.query(
      `SELECT o.id::text AS id, o.so_number, o.status, o.size, o.delivery_type,
              o.picker_id::text AS picker_id, p.name AS picker_name
         FROM orders o
         JOIN pickers p ON p.id = o.picker_id
        WHERE o.department = $1 AND DATE(o.created_at) = $2
        ORDER BY p.name, o.created_at`,
      [department, date]
    );

    const byPicker = new Map();
    for (const o of orders.rows) {
      if (!byPicker.has(o.picker_id)) {
        byPicker.set(o.picker_id, { picker_id: o.picker_id, picker_name: o.picker_name, orders: [] });
      }
      const { picker_id, picker_name, ...order } = o;
      byPicker.get(picker_id).orders.push(order);
    }

    const allIds = orders.rows.map(o => o.id);
    const signoffs = allIds.length
      ? await pool.query(
          `SELECT DISTINCT ON (picker_id)
                  id, picker_id, order_ids, signed_by, signed_at
             FROM picker_signoffs
            WHERE department = $1 AND order_ids && $2::text[]
            ORDER BY picker_id, signed_at DESC`,
          [department, allIds]
        )
      : { rows: [] };
    const latest = new Map(signoffs.rows.map(s => [s.picker_id, s]));

    const pickers = [...byPicker.values()].map(p => {
      const s = latest.get(p.picker_id) || null;
      const signed = new Set(s?.order_ids || []);
      return {
        ...p,
        signoff: s && { id: s.id, signed_by: s.signed_by, signed_at: s.signed_at, order_count: s.order_ids.length },
        new_order_ids: p.orders.filter(o => !signed.has(o.id)).map(o => o.id),
      };
    });

    res.json({ date, pickers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── View one signed sheet (includes the signature image) ─────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM picker_signoffs WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Signature not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Save a signature ──────────────────────────────────────────────────
// Body: { picker_id, department, order_ids: [...], signature: 'data:image/png;base64,...' }
router.post('/', auth, async (req, res) => {
  const { picker_id, department, order_ids, signature } = req.body;
  if (!picker_id || !department) return res.status(400).json({ error: 'Picker and department are required' });
  if (!Array.isArray(order_ids) || !order_ids.length) return res.status(400).json({ error: 'No orders to sign for' });
  if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,') || signature.length > 800_000) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    // Snapshot from the database, so the record shows exactly what was signed for
    const check = await pool.query(
      `SELECT o.id::text AS id, o.so_number, p.name AS picker_name
         FROM orders o JOIN pickers p ON p.id = o.picker_id
        WHERE o.id::text = ANY($1::text[]) AND o.picker_id::text = $2
        ORDER BY o.created_at`,
      [order_ids.map(String), String(picker_id)]
    );
    if (check.rows.length !== order_ids.length) {
      return res.status(409).json({ error: 'Assignments changed while signing — please reload and sign again.' });
    }

    const result = await pool.query(
      `INSERT INTO picker_signoffs (picker_id, picker_name, department, order_ids, so_numbers, signature, signed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, picker_id, picker_name, signed_by, signed_at, order_ids, so_numbers`,
      [String(picker_id), check.rows[0].picker_name, department,
       check.rows.map(r => r.id), check.rows.map(r => r.so_number),
       signature, req.user?.username || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
