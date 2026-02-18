const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Get checkers by department (public)
router.get('/', async (req, res) => {
  const { department } = req.query;
  try {
    const result = await pool.query(
      'SELECT id, name, department FROM checkers WHERE active = true AND department = $1 ORDER BY name',
      [department || 'machinery']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add checker (admin only)
router.post('/', auth, async (req, res) => {
  const { name, department } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO checkers (name, department) VALUES ($1, $2) RETURNING *',
      [name, department]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete checker (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('UPDATE checkers SET active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Checker removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get checker dashboard data
router.get('/:id/orders', async (req, res) => {
  try {
    const checker = await pool.query(
      'SELECT name FROM checkers WHERE id = $1', [req.params.id]
    );
    if (!checker.rows[0]) return res.status(404).json({ error: 'Checker not found' });

    // Orders ready to be checked (PICKED status)
    const available = await pool.query(
      `SELECT o.id, o.so_number, o.status, o.size, o.delivery_type,
              o.needs_second_checker, o.checker_id,
              p.name AS picker_name,
              c.name AS checker1_name
       FROM orders o
       LEFT JOIN pickers p ON o.picker_id = p.id
       LEFT JOIN checkers c ON o.checker_id = c.id
       WHERE o.status = 'PICKED'
         AND DATE(o.created_at) = CURRENT_DATE
         AND (o.needs_second_checker = false OR o.needs_second_checker IS NULL)
       ORDER BY o.picker_end ASC`
    );

    // Orders needing second checker (PICKED, needs_second_checker=true, no checker2 yet)
    const needSecond = await pool.query(
      `SELECT o.id, o.so_number, o.status, o.size, o.delivery_type,
              o.needs_second_checker, o.checker_id,
              p.name AS picker_name,
              c.name AS checker1_name
       FROM orders o
       LEFT JOIN pickers p ON o.picker_id = p.id
       LEFT JOIN checkers c ON o.checker_id = c.id
       WHERE o.status = 'CHECKING'
         AND o.needs_second_checker = true
         AND o.checker2_id IS NULL
         AND o.checker_id != $1
         AND DATE(o.created_at) = CURRENT_DATE
       ORDER BY o.picker_end ASC`,
      [req.params.id]
    );

    // Orders this checker is currently checking (as checker 1)
    const mine = await pool.query(
      `SELECT o.id, o.so_number, o.status, o.size, o.delivery_type,
              o.needs_second_checker, o.checker2_id,
              p.name AS picker_name,
              c2.name AS checker2_name
       FROM orders o
       LEFT JOIN pickers p ON o.picker_id = p.id
       LEFT JOIN checkers c2 ON o.checker2_id = c2.id
       WHERE o.checker_id = $1 AND o.status = 'CHECKING'
         AND DATE(o.created_at) = CURRENT_DATE`,
      [req.params.id]
    );

    // Orders this checker is checking as checker 2
    const mineAsChecker2 = await pool.query(
      `SELECT o.id, o.so_number, o.status, o.size, o.delivery_type,
              o.needs_second_checker,
              p.name AS picker_name,
              c1.name AS checker1_name
       FROM orders o
       LEFT JOIN pickers p ON o.picker_id = p.id
       LEFT JOIN checkers c1 ON o.checker_id = c1.id
       WHERE o.checker2_id = $1 AND o.status = 'CHECKING'
         AND DATE(o.created_at) = CURRENT_DATE`,
      [req.params.id]
    );

    // Done orders
    const done = await pool.query(
      `SELECT o.id, o.so_number, o.status, o.size, o.delivery_type,
              p.name AS picker_name
       FROM orders o
       LEFT JOIN pickers p ON o.picker_id = p.id
       WHERE (o.checker_id = $1 OR o.checker2_id = $1)
         AND o.status = 'DONE'
         AND DATE(o.created_at) = CURRENT_DATE
       ORDER BY o.checker_end DESC`,
      [req.params.id]
    );

    res.json({
      checkerName: checker.rows[0].name,
      availableOrders: available.rows,
      needSecondChecker: needSecond.rows,
      myOrders: mine.rows,
      myOrdersAsChecker2: mineAsChecker2.rows,
      doneOrders: done.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;