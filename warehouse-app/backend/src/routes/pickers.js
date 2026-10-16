const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Get all pickers by department (public)
router.get('/', async (req, res) => {
  const { department } = req.query;
  if (!department) return res.status(400).json({ error: 'Department is required' });
  try {
    // ?counts=1 adds today's to-do / in-progress counts for each picker
    const result = req.query.counts
      ? await pool.query(
          `SELECT p.id, p.name, p.department,
                  COUNT(o.id) FILTER (WHERE o.status = 'ASSIGNED')::int AS assigned_count,
                  COUNT(o.id) FILTER (WHERE o.status = 'PICKING')::int  AS picking_count
             FROM pickers p
             LEFT JOIN orders o ON o.picker_id = p.id AND DATE(o.created_at) = CURRENT_DATE
            WHERE p.active = true AND p.department = $1
            GROUP BY p.id ORDER BY p.name`,
          [department])
      : await pool.query(
          'SELECT id, name, department FROM pickers WHERE active = true AND department = $1 ORDER BY name',
          [department]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get picker's orders (public)
router.get('/:id/orders', async (req, res) => {
  try {
    const picker = await pool.query(
      'SELECT name FROM pickers WHERE id = $1',
      [req.params.id]
    );
    if (!picker.rows[0]) return res.status(404).json({ error: 'Picker not found' });

    const orders = await pool.query(
      `SELECT o.id, o.so_number, o.status, o.size, o.delivery_type, o.customer_name,
        (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id::text)::int AS line_count,
        (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id::text AND l.picked_qty IS NOT NULL)::int AS lines_done,
        (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id::text AND l.picked_qty IS NOT NULL AND l.picked_qty < l.qty)::int AS lines_short
       FROM orders o
       WHERE o.picker_id = $1 AND DATE(o.created_at) = CURRENT_DATE AND o.status <> 'CANCELLED'
       ORDER BY o.created_at DESC`,
      [req.params.id]
    );

    res.json({
      pickerName: picker.rows[0].name,
      orders: orders.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add picker (admin only)
router.post('/', auth, async (req, res) => {
  const { name, department } = req.body;
  console.log('Adding picker:', { name, department }); // debug log
  if (!name || !department) {
    return res.status(400).json({ error: 'Name and department are required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO pickers (name, department) VALUES ($1, $2) RETURNING *',
      [name, department]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Insert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete picker (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE pickers SET active = false WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Picker removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;