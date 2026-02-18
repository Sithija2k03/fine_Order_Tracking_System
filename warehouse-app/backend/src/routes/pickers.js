const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Get all pickers by department (public)
router.get('/', async (req, res) => {
  const { department } = req.query;
  if (!department) return res.status(400).json({ error: 'Department is required' });
  try {
    const result = await pool.query(
      'SELECT id, name, department FROM pickers WHERE active = true AND department = $1 ORDER BY name',
      [department]
    );
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
      `SELECT id, so_number, status, size, delivery_type
       FROM orders
       WHERE picker_id = $1 AND DATE(created_at) = CURRENT_DATE
       ORDER BY created_at DESC`,
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